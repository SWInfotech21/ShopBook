<?php
namespace App\Controllers;

use App\Core\Database;
use App\Models\User;
use App\Models\PasswordReset;
use App\Models\UserLog;

class AuthController
{
    public function login(): void
    {
        $input = json_decode(file_get_contents('php://input'), true) ?? [];
        $username = trim($input['username'] ?? '');
        $password = (string)($input['password'] ?? '');

        if ($username === '' || $password === '') {
            http_response_code(400);
            echo json_encode(['error' => 'Username and password required']);
            return;
        }

        $user = User::findByUsername($username);
        if (!$user || !password_verify($password, $user['password_hash'])) {
            http_response_code(401);
            echo json_encode(['error' => 'Invalid credentials']);
            return;
        }
        if ((int)$user['active'] !== 1) {
            http_response_code(403);
            echo json_encode(['error' => 'User deactivated']);
            return;
        }
        // Time window check (robust)
        date_default_timezone_set('Asia/Kolkata');
        $now = new \DateTimeImmutable('now');
        $nowSec = self::timeStringToSeconds($now->format('H:i:s'));
        $startStr = $user['allowed_time_start'];
        $endStr = $user['allowed_time_end'];
        $startStr = is_string($startStr) ? trim($startStr) : null;
        $endStr = is_string($endStr) ? trim($endStr) : null;
        $start = ($startStr === '' || $startStr === null) ? null : self::normaliseTime($startStr);
        $end = ($endStr === '' || $endStr === null) ? null : self::normaliseTime($endStr);
        if ($start !== null && $end !== null) {
            $startSec = self::timeStringToSeconds($start);
            $endSec = self::timeStringToSeconds($end);
            $allowed = false;
            if ($startSec <= $endSec) {
                // same-day window
                $allowed = ($nowSec >= $startSec && $nowSec <= $endSec);
            } else {
                // wraps midnight (e.g., 22:00 to 06:00)
                $allowed = ($nowSec >= $startSec || $nowSec <= $endSec);
            }
            if (!$allowed) {
                http_response_code(403);
                echo json_encode(['error' => 'Login not allowed at this time']);
                return;
            }
        }

        $token = bin2hex(random_bytes(24));
        $_SESSION['auth'] = [
            'id' => (int)$user['id'],
            'username' => $user['username'],
            'role' => $user['role'],
            'token' => $token,
        ];

        // Log login event
        try {
            date_default_timezone_set('Asia/Kolkata');
            $now = (new \DateTimeImmutable('now'))->format('Y-m-d H:i:s');
            $localIp = $_SERVER['REMOTE_ADDR'] ?? null;
            $serverIp = $_SERVER['SERVER_ADDR'] ?? ($_SERVER['LOCAL_ADDR'] ?? null);
            $host = $_SERVER['HTTP_HOST'] ?? ($_SERVER['SERVER_NAME'] ?? null);
            $ua = $_SERVER['HTTP_USER_AGENT'] ?? null;
            $lon = isset($input['longitude']) ? (string)$input['longitude'] : null;
            $lat = isset($input['latitude']) ? (string)$input['latitude'] : null;
            $loc = isset($input['location']) ? (string)$input['location'] : null;
            UserLog::create([
                'user_id' => (int)$user['id'],
                'login_time' => $now,
                'logout_time' => null,
                'local_ip' => $localIp,
                'server_ip' => $serverIp,
                'host' => $host,
                'longitude' => $lon,
                'latitude' => $lat,
                'location' => $loc,
                'user_agent' => $ua,
            ]);
        } catch (\Throwable $e) {
            // Do not block login if logging fails
        }

        echo json_encode(['token' => $token, 'user' => ['id' => (int)$user['id'], 'username' => $user['username'], 'role' => $user['role']]]);
    }

    public function me(): void
    {
        if (empty($_SESSION['auth'])) {
            http_response_code(401);
            echo json_encode(['error' => 'Unauthorized']);
            return;
        }
        $auth = $_SESSION['auth'];
        echo json_encode(['user' => ['id' => (int)$auth['id'], 'username' => $auth['username'], 'role' => $auth['role']]]);
    }

    public function logout(): void
    {
        // Ensure session is available
        if (session_status() === PHP_SESSION_NONE) {
            @session_start();
        }
        // Log logout time against most recent log for this user
        try {
            if (!empty($_SESSION['auth']['id'])) {
                date_default_timezone_set('Asia/Kolkata');
                $now = (new \DateTimeImmutable('now'))->format('Y-m-d H:i:s');
                UserLog::markLatestLogoutForUser((int)$_SESSION['auth']['id'], $now);
            }
        } catch (\Throwable $e) {
            // ignore logging failures on logout
        }
        // Clear server session
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000, $params['path'] ?? '/', $params['domain'] ?? '', $params['secure'] ?? false, $params['httponly'] ?? true);
        }
        @session_destroy();
        // Also advise client to drop any cached state
        echo json_encode(['ok' => true]);
    }

    public function forgotPassword(): void
    {
        $input = json_decode(file_get_contents('php://input'), true) ?? [];
        $identifier = trim((string)($input['username_or_email'] ?? ''));
        if ($identifier === '') { http_response_code(400); echo json_encode(['error'=>'username_or_email required']); return; }
        $user = User::findByUsername($identifier);
        if (!$user && filter_var($identifier, FILTER_VALIDATE_EMAIL)) {
            $u2 = User::findByEmail($identifier);
            if ($u2) $user = $u2;
        }
        // Always respond success to avoid user enumeration
        if (!$user) { echo json_encode(['ok'=>true]); return; }
        $token = bin2hex(random_bytes(24));
        $expires = (new \DateTimeImmutable('+1 hour'))->format('Y-m-d H:i:s');
        PasswordReset::create((int)$user['id'], $token, $expires);
        // In real app, send email/SMS. For now return token for testing.
        echo json_encode(['ok'=>true, 'token'=>$token]);
    }

    public function resetPassword(): void
    {
        $input = json_decode(file_get_contents('php://input'), true) ?? [];
        $token = (string)($input['token'] ?? '');
        $new = (string)($input['new_password'] ?? '');
        if ($token === '' || $new === '') { http_response_code(400); echo json_encode(['error'=>'token and new_password required']); return; }
        $rec = PasswordReset::findValid($token);
        if (!$rec) { http_response_code(400); echo json_encode(['error'=>'Invalid or expired token']); return; }
        $hash = password_hash($new, PASSWORD_DEFAULT);
        User::setPassword((int)$rec['user_id'], $hash);
        PasswordReset::markUsed((int)$rec['id']);
        echo json_encode(['reset' => true]);
    }

    public function changePassword(): void
    {
        if (empty($_SESSION['auth'])) { http_response_code(401); echo json_encode(['error'=>'Unauthorized']); return; }
        $auth = $_SESSION['auth'];
        $input = json_decode(file_get_contents('php://input'), true) ?? [];
        $current = (string)($input['current_password'] ?? '');
        $new = (string)($input['new_password'] ?? '');
        if ($current === '' || $new === '') { http_response_code(400); echo json_encode(['error'=>'current_password and new_password required']); return; }
        $user = User::findById((int)$auth['id']);
        if (!$user || !password_verify($current, $user['password_hash'])) { http_response_code(400); echo json_encode(['error'=>'Invalid current password']); return; }
        $hash = password_hash($new, PASSWORD_DEFAULT);
        User::setPassword((int)$auth['id'], $hash);
        echo json_encode(['changed' => true]);
    }

    // --- Helpers ---
    private static function normaliseTime(string $time): string
    {
        // Accept H:i or H:i:s; coerce to H:i:s
        $time = trim($time);
        // If only HH:MM provided
        if (preg_match('/^\d{2}:\d{2}$/', $time)) {
            return $time . ':00';
        }
        // If H:M or H:M:S variations, try to parse via DateTime
        try {
            $dt = new \DateTimeImmutable($time);
            return $dt->format('H:i:s');
        } catch (\Throwable $e) {
            // Fallback: if invalid, treat as null-equivalent by returning 00:00:00
            return '00:00:00';
        }
    }

    private static function timeStringToSeconds(string $time): int
    {
        $parts = explode(':', $time);
        if (count($parts) < 2) return 0;
        $h = (int)$parts[0];
        $m = (int)$parts[1];
        $s = isset($parts[2]) ? (int)$parts[2] : 0;
        return $h * 3600 + $m * 60 + $s;
    }
}
