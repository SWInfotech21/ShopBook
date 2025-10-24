<?php
namespace App\Models;

use App\Core\Database;

class PasswordReset
{
    public static function create(int $userId, string $token, string $expiresAt): int
    {
        $stmt = Database::pdo()->prepare('INSERT INTO password_resets (user_id, token, expires_at) VALUES (?,?,?)');
        $stmt->execute([$userId, $token, $expiresAt]);
        return (int)Database::pdo()->lastInsertId();
    }

    public static function findValid(string $token): ?array
    {
        $stmt = Database::pdo()->prepare('SELECT * FROM password_resets WHERE token = ? AND used_at IS NULL AND expires_at > NOW() LIMIT 1');
        $stmt->execute([$token]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    public static function markUsed(int $id): void
    {
        $stmt = Database::pdo()->prepare('UPDATE password_resets SET used_at = NOW() WHERE id = ?');
        $stmt->execute([$id]);
    }
}
