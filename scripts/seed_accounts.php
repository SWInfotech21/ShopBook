<?php
// Run with: php scripts/seed_accounts.php
require __DIR__ . '/../src/config.php';
require __DIR__ . '/../src/Core/Autoload.php';

use App\Core\Database;

$path = __DIR__ . '/../migrations/002_seed_accounts.sql';
if (!file_exists($path)) {
    fwrite(STDERR, "Seed file not found: $path\n");
    exit(1);
}
$sql = file_get_contents($path);
$pdo = Database::pdo();
try {
    $pdo->exec($sql);
    echo "Accounts seeded.\n";
} catch (Throwable $e) {
    fwrite(STDERR, "Seeding failed: " . $e->getMessage() . "\n");
    exit(1);
}
