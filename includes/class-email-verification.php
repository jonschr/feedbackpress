<?php
/**
 * Email proof for shared reviewers, separate from WordPress login/private notes.
 *
 * @package FeedbackPress
 */

namespace FeedbackPress;

defined( 'ABSPATH' ) || exit;

/** Owns short-lived verification links and remembered shared-review identity. */
final class Email_Verification {
	/** HttpOnly proof cookie; it never creates a WordPress session. */
	const COOKIE = '__Secure-feedbackpress-email';

	/**
	 * Read a remembered identity only while its project grant is still valid.
	 *
	 * @param array|null $connection Exact connection being forwarded.
	 * @return array|null
	 */
	public static function current( ?array $connection = null ): ?array {
		if ( is_user_logged_in() ) {
			return null;
		}
		$token = sanitize_text_field( wp_unslash( $_COOKIE[ self::COOKIE ] ?? '' ) );
		$data  = self::read( $token, 'reviewer-session' );
		if ( ! $data ) {
			return null;
		}
		$c     = $connection ?? Service::connection();
		$grant = ReviewAccess::grant( null, $c );
		if ( ! $grant || ( $c['project'] ?? '' ) !== $data['project'] || Service::home() !== $data['site'] || ! hash_equals( $data['grant'], hash( 'sha256', $grant['token'] ) ) ) {
			return null;
		}
		return array(
			'name'  => $data['name'],
			'email' => $data['email'],
			'id'    => Identity::id( $data['email'] ),
		);
	}

	/**
	 * Send a proof without submitting the pending contribution.
	 *
	 * @throws \InvalidArgumentException When the address or destination is invalid.
	 * @throws \RuntimeException When the proof cannot be prepared.
	 * @param \WP_REST_Request $request Native REST request.
	 * @return array
	 */
	public static function request( \WP_REST_Request $request ): array {
		if ( is_user_logged_in() ) {
			return array(
				'verified' => true,
				'reviewer' => Identity::request( $request ),
			);
		}
		$person = Identity::claim( $request );
		$id     = API::key( $request );
		$c      = Service::connection();
		$path   = (string) $request->get_param( 'path' );
		$base   = wp_parse_url( Service::home() );
		if ( ! str_starts_with( $path, '/' ) || str_starts_with( $path, '//' ) || str_contains( $path, '\\' ) || preg_match( '/[#\r\n\x00]/', $path ) || strlen( $path ) > 2000 || 'https' !== $base['scheme'] ) {
			throw new \InvalidArgumentException( 'Open feedback on an HTTPS site, or log in to WordPress.' );
		}
		$grant = ReviewAccess::grant();
		if ( ! $grant ) {
			$link   = Service::request( 'GET', '/review-link' );
			$prefix = Service::home() . '/#fp-review=';
			if ( ! str_starts_with( $link['url'] ?? '', $prefix ) ) {
				throw new \RuntimeException( 'Could not prepare email verification.', 503 );
			}
			$grant = array( 'token' => substr( $link['url'], strlen( $prefix ) ) );
		}
		$return = (string) $request->get_param( 'return' );
		if ( $return && ! preg_match( '/^feedbackpress=[a-f0-9-]{36}$/D', $return ) ) {
			throw new \InvalidArgumentException( 'Choose a valid feedback destination.' );
		}
		$fingerprint = hash( 'sha256', wp_json_encode( array( $person, $path, $return, $c['project'] ) ) );
		$pending_key = 'fp_email_issued_' . $id;
		$pending     = get_transient( $pending_key );
		if ( $pending && $pending['fingerprint'] !== $fingerprint ) {
			throw new \RuntimeException( 'The verification request changed. Try again.', 409 );
		}
		$issued = $pending['issued'] ?? time();
		if ( ! $pending ) {
			set_transient(
				$pending_key,
				array(
					'fingerprint' => $fingerprint,
					'issued'      => $issued,
				),
				15 * MINUTE_IN_SECONDS
			);
		}
		$data  = $person + array(
			'request' => $id,
			'project' => $c['project'],
			'site'    => Service::home(),
			'grant'   => hash( 'sha256', $grant['token'] ),
			'expires' => $issued + 15 * MINUTE_IN_SECONDS,
		);
		$proof = self::sign( $data, 'verify-email' );
		$url   = $base['scheme'] . '://' . $base['host'] . ( isset( $base['port'] ) ? ':' . $base['port'] : '' ) . $path . '#fp-review=' . $grant['token'] . '&fp-verify=' . rawurlencode( $proof );
		if ( $return ) {
			$url .= '&fp-return=' . rawurlencode( $return );
		}
		return Service::request(
			'POST',
			'/email-verification',
			array(
				'person'    => $person,
				'url'       => $url,
				'issued_at' => $issued,
			),
			$id
		);
	}

	/**
	 * Consume a delivered proof once and remember its verified email.
	 *
	 * @throws \RuntimeException When the link is expired, revoked, or already used.
	 * @param string $proof Delivered proof, never a WordPress login credential.
	 * @param string $grant Validated canonical review grant.
	 * @return void
	 */
	public static function accept( string $proof, string $grant ): void {
		if ( is_user_logged_in() ) {
			return;
		}
		$data = self::read( $proof, 'verify-email' );
		$c    = Service::connection();
		if ( ! $data || ( $c['project'] ?? '' ) !== $data['project'] || Service::home() !== $data['site'] || ! hash_equals( $data['grant'], hash( 'sha256', $grant ) ) || ! Service::uuid( $data['request'] ?? '' ) ) {
			throw new \RuntimeException( 'This verification link is unavailable or expired. Request a new email.', 403 );
		}
		Service::http(
			'POST',
			Service::origin( $c['service'] ) . '/v1/projects/' . $c['project'] . '/email-verification/consume',
			$c['token'],
			array(
				'id'    => $data['request'],
				'proof' => $proof,
			),
			site: Service::home()
		);
		delete_transient( 'fp_email_issued_' . $data['request'] );
		$data['expires'] = time() + 180 * DAY_IN_SECONDS;
		$value           = self::sign( $data, 'reviewer-session' );
		setcookie(
			self::COOKIE,
			$value,
			array(
				'expires'  => $data['expires'],
				'path'     => rtrim( (string) wp_parse_url( home_url(), PHP_URL_PATH ), '/' ) . '/',
				'secure'   => true,
				'httponly' => true,
				'samesite' => 'Lax',
			)
		);
		$_COOKIE[ self::COOKIE ] = $value;
	}

	/**
	 * Sign purpose-separated payloads with the installation's native secret.
	 *
	 * @param array  $data Verified data.
	 * @param string $purpose Proof purpose.
	 * @return string
	 */
	private static function sign( array $data, string $purpose ): string {
		$payload = Service::pack( $data );
		// phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode -- URL-safe HMAC encoding, not executable content.
		return $payload . '.' . rtrim( strtr( base64_encode( hash_hmac( 'sha256', $purpose . "\n" . $payload, wp_salt( 'auth' ), true ) ), '+/', '-_' ), '=' );
	}

	/**
	 * Validate a signed proof before reading any identity fields.
	 *
	 * @param string $token Signed token.
	 * @param string $purpose Proof purpose.
	 * @return array|null
	 */
	private static function read( string $token, string $purpose ): ?array {
		if ( strlen( $token ) > 4096 || ! preg_match( '/^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/D', $token, $parts ) ) {
			return null;
		}
		// phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode -- URL-safe HMAC encoding, not executable content.
		$expected = rtrim( strtr( base64_encode( hash_hmac( 'sha256', $purpose . "\n" . $parts[1], wp_salt( 'auth' ), true ) ), '+/', '-_' ), '=' );
		if ( ! hash_equals( $expected, $parts[2] ) ) {
			return null;
		}
		$data = Service::unpack( $parts[1] );
		$ttl  = 'verify-email' === $purpose ? 15 * MINUTE_IN_SECONDS : 180 * DAY_IN_SECONDS;
		if ( ! is_int( $data['expires'] ?? null ) || $data['expires'] <= time() || $data['expires'] > time() + $ttl + MINUTE_IN_SECONDS || ! is_string( $data['email'] ?? null ) || ! is_email( $data['email'] ) || ! is_string( $data['name'] ?? null ) || ! is_string( $data['project'] ?? null ) || ! is_string( $data['site'] ?? null ) || ! preg_match( '/^[a-f0-9]{64}$/D', $data['grant'] ?? '' ) ) {
			return null;
		}
		return $data;
	}
}
