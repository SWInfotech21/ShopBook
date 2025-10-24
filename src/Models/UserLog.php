<?php
namespace App\Models;

use App\Core\Database;
use PDO;

class UserLog
{
    public static function create(array $data): int
    {
        $sql = 'INSERT INTO user_logs (user_id, login_time, logout_time, local_ip, server_ip, host, longitude, latitude, location, user_agent) VALUES (?,?,?,?,?,?,?,?,?,?)';
        $stmt = Database::pdo()->prepare($sql);
        $stmt->execute([
            (int)$data['user_id'],
            $data['login_time'],
            $data['logout_time'] ?? null,
            $data['local_ip'] ?? null,
            $data['server_ip'] ?? null,
            $data['host'] ?? null,
            $data['longitude'] ?? null,
            $data['latitude'] ?? null,
            $data['location'] ?? null,
            $data['user_agent'] ?? null,
        ]);
        return (int)Database::pdo()->lastInsertId();
    }

    public static function markLatestLogoutForUser(int $userId, string $logoutTime): void
    {
        // Update the most recent log (max id) for the user
        $pdo = Database::pdo();
        $sql = 'UPDATE user_logs SET logout_time = ? WHERE id = (
            SELECT id FROM (
                SELECT id FROM user_logs WHERE user_id = ? ORDER BY id DESC LIMIT 1
            ) t
        )';
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$logoutTime, $userId]);
    }
}
