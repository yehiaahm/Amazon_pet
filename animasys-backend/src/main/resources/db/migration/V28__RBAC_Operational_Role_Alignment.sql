-- Align operational role seeds with endpoints those roles are expected to access.

-- CASHIER: daily closing requires finance.view_reports (comment in V27)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code = 'finance.view_reports'
WHERE r.code = 'CASHIER'
  AND NOT EXISTS (
      SELECT 1 FROM role_permissions rp
      WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- GROOMER: boarding status updates require boarding.edit_reservation
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code = 'boarding.edit_reservation'
WHERE r.code = 'GROOMER'
  AND NOT EXISTS (
      SELECT 1 FROM role_permissions rp
      WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );
