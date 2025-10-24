<?php
// Run with: php scripts/seed_users.php
require __DIR__ . '/../src/config.php';
require __DIR__ . '/../src/Core/Autoload.php';

use App\Core\Database;

$pdo = Database::pdo();

$users = [
    ['username' => 'Radmin', 'password' => 'Radmin', 'role' => 'readonly_admin'],
    ['username' => 'Admin', 'password' => 'Admin', 'role' => 'admin'],
    ['username' => 'MyUser', 'password' => 'Pass', 'role' => 'user'],
];

foreach ($users as $u) {
    $hash = password_hash($u['password'], PASSWORD_DEFAULT);
    $stmt = $pdo->prepare('INSERT INTO users (username, password_hash, role, active) VALUES (?,?,?,1) ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash), role=VALUES(role), active=1');
    $stmt->execute([$u['username'], $hash, $u['role']]);
    echo "Seeded user: {$u['username']}\n";
}
