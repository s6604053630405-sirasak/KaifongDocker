# วิธี Insert ข้อมูลลง Database ด้วยมือ (kaifong_db)

ใช้เมื่อ container `kaifong_db` รันอยู่แล้ว และต้องการใส่ข้อมูลตัวอย่างเข้าไปโดย
ไม่ต้องล้าง volume / ไม่ต้อง `docker compose down -v` ใหม่

## เตรียมของก่อนเริ่ม

1. ตรวจว่า container `kaifong_db` กำลังรันอยู่:
   ```powershell
   docker ps
   ```
2. ต้องมีตาราง (schema) อยู่แล้วในฐานข้อมูล — ถ้ายังไม่มี ให้รัน `create-table.sql`
   ก่อน (ผ่าน `docker exec -i kaifong_db psql -U kaifong -d kaifongdb -f ...`)
3. จัดไฟล์ทั้งหมดไว้ในโฟลเดอร์ `db/seed/` บนเครื่อง:
   ```
   db/seed/
     insert_part1_base.sql
     insert_part2_summary.sql
     users.csv
     complaints_bkk.csv
     complaint_files.csv
     complaint_feedback.csv
     workflow_logs_new.csv
   ```
   CSV ทุกไฟล์ต้องเป็น **UTF-8 ไม่มี BOM** (ถ้าเซฟจาก Excel ให้เลือก "CSV UTF-8"
   ตอน Save As ไม่ใช่ CSV เฉยๆ)

## ขั้นตอน

**1) คัดลอกโฟลเดอร์ seed เข้าไปใน container**
```powershell
docker cp db\seed kaifong_db:/tmp/seed
```

**2) รัน insert ชุดที่ 1 — master/reference data**
(tenants, categories, channels, departments, permissions, priority_levels,
roles, role_permissions, sla_matrix, status_master, subcategories, teams)
```powershell
docker exec -i kaifong_db psql -U kaifong -d kaifongdb -f /tmp/seed/insert_part1_base.sql
```

**3) เปิด psql เข้าไปทำงานต่อ**
```powershell
docker exec -it kaifong_db psql -U kaifong -d kaifongdb
```

**4) insert ตาราง `users`** (ต้องการ roles, tenants จากขั้นตอน 2 ก่อนแล้ว)

⚠️ ต้องระบุ column list เพราะตอนนี้ schema มี `status`, `approved_at`,
`approved_by` เพิ่มมาจาก migration `member_approval_status.sql` ที่รวมเข้า
`create-table.sql` ไปแล้ว แต่ CSV ยังเป็นชุดข้อมูลเดิมที่ไม่มี 3 คอลัมน์นี้ —
ถ้า `\copy` แบบไม่ระบุ column list จะ error เพราะจำนวนคอลัมน์ไม่ตรงกัน
(คอลัมน์ที่ไม่ได้ระบุจะใช้ค่า default: `status` = `'approved'`, `approved_at`
และ `approved_by` = `NULL`)
```sql
\copy users(user_id, tenant_id, title_name, first_name, last_name, display_name, line_user_id, email, phone_number, citizen_type, role_id, is_active, last_login_at, created_at, updated_at)
FROM '/tmp/seed/users.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8');
```

**5) insert ตาราง `complaints`** (ต้องการ users จากขั้นตอน 4 + categories/channels/
status_master/teams จากขั้นตอน 2)

(คำสั่งนี้ระบุ column list ไว้แล้วเช่นกัน เพราะ schema มี `title` และ
`location_details` เพิ่มมาที่ CSV ไม่มี — คอลัมน์ที่ไม่ได้ระบุจะเป็น `NULL`
โดยอัตโนมัติ ไม่ error)
```sql
\copy complaints(complaint_id, complaint_no, tenant_id, channel_id, user_id, category_id, subcategory_id, priority_id, latitude, longitude, district, province, detail, additional_detail, location_text, geocoded_at, location_accuracy, current_status_id, assigned_team_id, assigned_user_id, is_public_view, due_date, resolved_at, closed_at, created_at, updated_at)
FROM '/tmp/seed/complaints_bkk.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8');
```

**6) insert ตาราง `complaint_files`** (ต้องการ complaints จากขั้นตอน 5)
```sql
\copy complaint_files FROM '/tmp/seed/complaint_files.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8');
```

**7) insert ตาราง `complaint_feedback`** (ต้องการ complaints จากขั้นตอน 5)
```sql
\copy complaint_feedback FROM '/tmp/seed/complaint_feedback.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8');
```

**8) insert ตาราง `workflow_logs`** (ต้องการ complaints จากขั้นตอน 5)
```sql
\copy workflow_logs FROM '/tmp/seed/workflow_logs_new.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8');
```

**9) ออกจาก psql**
```sql
\q
```

**10) รัน insert ชุดที่ 2 — summary/derived data**
(staff_credentials, team_members, sla_tracking, daily_complaint_summary,
category_summary, area_summary, sla_summary — ต้องการ users/teams/complaints/
sla_matrix ให้มีอยู่ครบก่อน จึงต้องรันเป็นลำดับสุดท้าย)
```powershell
docker exec -i kaifong_db psql -U kaifong -d kaifongdb -f /tmp/seed/insert_part2_summary.sql
```

## เช็คว่าข้อมูลเข้าครบ

```powershell
docker exec -it kaifong_db psql -U kaifong -d kaifongdb -c "
SELECT 'users' t, count(*) FROM users
UNION ALL SELECT 'complaints', count(*) FROM complaints
UNION ALL SELECT 'complaint_files', count(*) FROM complaint_files
UNION ALL SELECT 'complaint_feedback', count(*) FROM complaint_feedback
UNION ALL SELECT 'workflow_logs', count(*) FROM workflow_logs;
"
```
ตัวเลขที่ควรได้: users 2,120 / complaints 31,000 / complaint_files 36,116 /
complaint_feedback 18,628 / workflow_logs 114,013

## ข้อควรระวัง

- **รันได้แค่ครั้งเดียวต่อฐานข้อมูลเปล่า** — ถ้ารันซ้ำกับฐานที่มีข้อมูลนี้อยู่แล้ว
  จะเจอ `duplicate key value violates unique constraint` เพราะ `complaint_no`,
  `line_user_id` ฯลฯ เป็น UNIQUE ต้องล้างตารางหรือสร้าง container ใหม่ก่อนรันซ้ำ
- **ลำดับห้ามสลับ** — ทุกขั้นตอนอ้างอิงข้อมูลจากขั้นตอนก่อนหน้าผ่าน foreign key
  ถ้าสลับลำดับจะเจอ `violates foreign key constraint`
- **อย่าใส่ `NULL 'NULL'` เพิ่มเข้าไปใน `\copy`** — CSV ชุดนี้ใช้ช่องว่างเปล่าแทน
  ค่า NULL อยู่แล้ว (Postgres ถือเป็น NULL โดย default สำหรับ `FORMAT csv`)
  ถ้าใส่ตัวเลือกนี้เพิ่มจะทำให้ช่องว่างเปล่ากลายเป็น empty string แทน NULL
  แล้ว insert ลง column ประเภท timestamp ไม่ได้
- **ถ้า schema เปลี่ยน (เพิ่ม/ลบคอลัมน์) ต้องเช็ค column list ใหม่ทุกครั้ง** —
  `\copy table FROM ...` แบบไม่ระบุ column list จะ map ตามลำดับคอลัมน์ *ทั้งหมด*
  ของตาราง ถ้าจำนวนคอลัมน์ใน CSV กับตารางไม่เท่ากัน (เช่นมี migration เพิ่มคอลัมน์
  เข้าไปทีหลัง) จะ error ทันที — ให้ระบุ column list ตรงๆ แบบที่ทำกับ `users` และ
  `complaints` ไว้เป็นตัวอย่างในไฟล์นี้