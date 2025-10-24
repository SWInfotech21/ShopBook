<?php
// Run with: php scripts/migrate.php
require __DIR__ . '/../src/config.php';
require __DIR__ . '/../src/Core/Autoload.php';

use App\Core\Database;

$path = __DIR__ . '/../migrations/001_schema.sql';
if (!file_exists($path)) {
    fwrite(STDERR, "Migration file not found: $path\n");
    exit(1);
}
$sql = file_get_contents($path);

// Ensure database exists first using a DSN without dbname
try {
    $dsn = 'mysql:host=' . DB_HOST . ';charset=utf8mb4';
    $pdoRoot = new PDO($dsn, DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    ]);
    $dbName = DB_NAME;
    $pdoRoot->exec("CREATE DATABASE IF NOT EXISTS `{$dbName}` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci");
    echo "Database ensured: {$dbName}\n";
} catch (Throwable $e) {
    fwrite(STDERR, "Failed to ensure database: " . $e->getMessage() . "\n");
    exit(1);
}

// Now apply schema via app Database PDO (uses dbname)
$pdo = Database::pdo();
try {
    $pdo->exec($sql);
    echo "Migration applied.\n";
} catch (Throwable $e) {
    fwrite(STDERR, "Migration failed: " . $e->getMessage() . "\n");
    exit(1);
}
