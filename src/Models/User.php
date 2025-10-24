<?php
namespace App\Models;

use App\Core\Database;
use PDO;

class User
{
    public static function findByUsername(string $username): ?array
    {
        $stmt = Database::pdo()->prepare('SELECT * FROM users WHERE username = ? LIMIT 1');
        $stmt->execute([$username]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    public static function findById(int $id): ?array
    {
        $stmt = Database::pdo()->prepare('SELECT * FROM users WHERE id = ? LIMIT 1');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    public static function findByEmail(string $email): ?array
    {
        $stmt = Database::pdo()->prepare('SELECT * FROM users WHERE email = ? LIMIT 1');
        $stmt->execute([$email]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    public static function create(array $data): int
    {
        $stmt = Database::pdo()->prepare('INSERT INTO users (username, password_hash, role, active, allowed_time_start, allowed_time_end, email) VALUES (?,?,?,?,?,?,?)');
        $stmt->execute([
            $data['username'],
            $data['password_hash'],
            $data['role'],
            $data['active'] ?? 1,
            $data['allowed_time_start'] ?? null,
            $data['allowed_time_end'] ?? null,
            $data['email'] ?? null,
        ]);
        return (int)Database::pdo()->lastInsertId();
    }

    public static function update(int $id, array $data): void
    {
        $stmt = Database::pdo()->prepare('UPDATE users SET role=?, active=?, allowed_time_start=?, allowed_time_end=?, updated_at=NOW() WHERE id=?');
        $stmt->execute([
            $data['role'],
            $data['active'],
            $data['allowed_time_start'],
            $data['allowed_time_end'],
            $id,
        ]);
    }

    public static function setActive(int $id, bool $active): void
    {
        $stmt = Database::pdo()->prepare('UPDATE users SET active = ?, updated_at = NOW() WHERE id = ?');
        $stmt->execute([$active ? 1 : 0, $id]);
    }

    public static function setPassword(int $id, string $passwordHash): void
    {
        $stmt = Database::pdo()->prepare('UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?');
        $stmt->execute([$passwordHash, $id]);
    }

    public static function delete(int $id): void
    {
        $stmt = Database::pdo()->prepare('DELETE FROM users WHERE id = ?');
        $stmt->execute([$id]);
    }

    public static function all(): array
    {
        $stmt = Database::pdo()->query('SELECT id, username, role, active, allowed_time_start, allowed_time_end, email, created_at FROM users ORDER BY id');
        return $stmt->fetchAll();
    }
}

