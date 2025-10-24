<?php
namespace App\Core;

class Security
{
    public static function csrfToken(): string
    {
        if (empty($_SESSION['csrf'])) {
            $_SESSION['csrf'] = bin2hex(random_bytes(32));
        }
        return $_SESSION['csrf'];
    }

    public static function verifyCsrf(?string $token): bool
    {
        return isset($_SESSION['csrf']) && hash_equals($_SESSION['csrf'], (string)$token);
    }

    public static function requireAuth(array $roles = []): array
    {
        if (empty($_SESSION['auth'])) {
            http_response_code(401);
            echo json_encode(['error' => 'Unauthorized']);
            exit;
        }
        $auth = $_SESSION['auth'];
        if ($roles && !in_array($auth['role'], $roles, true)) {
            http_response_code(403);
            echo json_encode(['error' => 'Forbidden']);
            exit;
        }
        return $auth;
    }
}
