# Kaifong Project

ระบบจัดการเรื่องร้องเรียน Kaifong ประกอบด้วย Frontend, Backend และฐานข้อมูล PostgreSQL ที่ทำงานผ่าน Docker

---

## สิ่งที่ต้องติดตั้ง

- Git
- Git LFS
- Docker Desktop

ติดตั้ง Git LFS (ครั้งแรกเท่านั้น)

```bash
git lfs install
```

---

## 1. Clone Project

```bash
git clone https://github.com/Natokrit/KaifongDocker.git
cd KaifongDocker
```

หากไฟล์ฐานข้อมูลยังไม่ถูกดาวน์โหลด

```bash
git lfs pull
```

---

## 2. ตั้งค่า Environment Variables

สร้างไฟล์ `.env` ที่ root ของโปรเจกต์ (ระดับเดียวกับ `docker-compose.yml`) แล้วใส่ค่า:

```
LINE_CHANNEL_ACCESS_TOKEN=ใส่ token จริงตรงนี้
```

ค่านี้จำเป็นสำหรับ service `kaifong_ai_v2` — ถ้าไม่ตั้งค่า container จะ start ไม่ติด

---

## 3. Start Docker

```bash
docker compose down -v
docker compose up --build -d
```

ตรวจสอบว่า Container ทำงาน

```bash
docker ps
```

Container ที่ควรเห็น: `kaifong_db`, `kaifongai`, `kaifongliff`, `kaifong_ai_v2`

---

## 3. Restore Database (ครั้งแรกเท่านั้น)

```powershell
Get-Content db/dumps/complaint_system_db_v002.sql |
docker exec -i kaifong_db psql -U kaifong -d kaifongdb
```

---

## 4. ตรวจสอบจำนวนตาราง

เข้าสู่ PostgreSQL

```bash
docker exec -it kaifong_db psql -U kaifong -d kaifongdb
```

จากนั้นรัน

```sql
SELECT table_type, COUNT(*)
FROM information_schema.tables
WHERE table_schema = 'public'
GROUP BY table_type;
```

ผลลัพธ์ที่ถูกต้อง

 table_type | count 
------------+-------
 VIEW       |     2
 BASE TABLE |    40
(2 rows)

หากได้ 41 ตาราง แสดงว่าฐานข้อมูลพร้อมใช้งาน

# การเข้าใช้งานระบบ

### LIFF Frontend

```
http://localhost:3000
```

### AI / Dashboard

```
http://localhost:3001
```

---

### AI Service (kaifong_ai_v2)

วิเคราะห์คำร้องเรียนด้วย NLP + CLIP (คัดกรองสแปม, จำแนกประเภท, ตรวจ PII, มอบหมายงานอัตโนมัติ) รับข้อมูลจาก kaifongliff แล้วบันทึกผลลง kaifongdb

```
http://localhost:8000        # หน้าแรก เช็คว่า server ทำงาน
http://localhost:8000/docs   # Swagger UI ทดสอบ API
```

### ทดสอบผ่าน Postman

เหมาะกับทดสอบที่ต้องอัปโหลดรูปภาพ + เก็บ request ไว้ใช้ซ้ำ:

1. สร้าง request แบบ `POST` ไปที่ `http://127.0.0.1:8000/test-score`
2. แท็บ **Headers** เพิ่ม:
   - Key: `X-API-Key`
   - Value: ค่า key ที่ได้จากเทอร์มินัลตอนรันครั้งแรก
3. แท็บ **Body** เลือก `form-data` ใส่ฟิลด์:
   - `category` (Text)
   - `subcategory` (Text)
   - `description` (Text)
   - `image` (type: **File**)
4. กด **Send**

ถ้าอยากทดสอบซ้ำบ่อยๆ แนะนำบันทึก request นี้ไว้ใน Collection ของ Postman แล้ว export/share ให้ทีมใช้ต่อได้เลย

## 🔑 การขอ API Key (Value: ค่า key ที่ได้จากเทอร์มินัลตอนรันครั้งแรก)

Endpoint ที่ต้องยืนยันตัวตน (เช่น `/test-score`) จะถูกป้องกันด้วย `X-API-Key` header

### วิธีดู API Key ครั้งแรก

เมื่อรัน container ครั้งแรกและยังไม่มีไฟล์ `api_keys.json` ระบบจะ generate key แบบสุ่มให้อัตโนมัติ 
**และ print ออกมาทาง log เพียงครั้งเดียวเท่านั้น** (จะไม่แสดงซ้ำอีก)

```bash
# เปิด log แบบ follow ไว้ก่อน (terminal 1)
docker logs -f kaifong_ai_v2

# เปิด terminal อีกหน้าต่างแยกต่างหาก แล้วยิง request ไป trigger (terminal 2)
curl -X POST http://localhost:8000/test-score
```

จะเห็น log แบบนี้ขึ้นมาใน terminal 1:

```
⚠️  ยังไม่มีไฟล์ api_keys.json — สร้าง API Key เริ่มต้นให้แล้ว
    API KEY (เก็บไว้ให้ดี ไม่แสดงซ้ำอีก): a1b2c3d4e5f6...
```

---

# ข้อมูลฐานข้อมูล

| รายการ | ค่า |
|--------|------|
| Host | localhost |
| Port | 5433 |
| Database | kaifongdb |
| Username | kaifong |
| Password | kaifong1234 |

---

# คำสั่งที่ใช้บ่อย

### เปิดระบบ

```bash
docker compose up -d
```

### Build ใหม่

```bash
docker compose up --build
```

### ปิดระบบ

```bash
docker compose down
```

### ลบ Container และฐานข้อมูลทั้งหมด

```bash
docker compose down -v
```

### ดู Log

```bash
docker compose logs -f
```

---

# โครงสร้างโปรเจกต์

```
KaifongDocker
│
├── db
│   ├── dumps
│   ├── init
│   ├── migrations
│   └── seed
│
├── kaifongai        # Dashboard (Next.js) - port 3001
│
├── kaifongliff      # LIFF Frontend (Next.js) - port 3000
│
├── kaifong_ai_v2    # AI Service (FastAPI: NLP + CLIP) - port 8000
│   ├── main.py
│   ├── config.py
│   ├── db.py
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .dockerignore
│
├── docker-compose.yml
│
├── .env             # ไม่ commit เข้า git (LINE_CHANNEL_ACCESS_TOKEN ฯลฯ)
│
└── README.md
```

---

# หมายเหตุ

- โปรเจกต์นี้ใช้ **Git LFS** สำหรับจัดเก็บไฟล์ฐานข้อมูล (`complaint_system_db_v002.sql`)
- กรุณาติดตั้ง Git LFS ก่อน Clone โปรเจกต์
- หาก Clone แล้วไม่พบไฟล์ฐานข้อมูล ให้รัน

```bash
git lfs pull
```

---

# ขั้นตอนการติดตั้ง (สรุป)

```bash
git lfs install

git clone https://github.com/Thxngfh/KaifongDocker.git
cd KaifongDocker

# สร้างไฟล์ .env ที่ root แล้วใส่ LINE_CHANNEL_ACCESS_TOKEN ก่อน

docker compose down -v
docker compose up --build -d

Get-Content db/dumps/complaint_system_db_v002.sql |
docker exec -i kaifong_db psql -U kaifong -d kaifongdb

docker exec -it kaifong_db psql -U kaifong -d kaifongdb

SELECT table_type, COUNT(*)
FROM information_schema.tables
WHERE table_schema = 'public'
GROUP BY table_type;
```

จากนั้นเข้าใช้งานได้ที่

- LIFF : http://localhost:3000
- AI : http://localhost:3001
- AI Service (Swagger) : http://localhost:8000/docs

## การอัปเดตโปรเจกต์

หากมีการอัปเดตจาก GitHub ให้รัน

```bash
git pull
git lfs pull
docker compose up --build -d
```
