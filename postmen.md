# Create Admin Account With Postman

Admin accounts are stored in MongoDB in the `admins` collection. Do not put admin email IDs or passwords in `.env`.

Use `.env` only for shared app configuration such as:

```env
DATABASE_URL="mongodb://localhost:27017/ai_call_analyzer"
JWT_SECRET="your-random-32-plus-char-secret"
```

## 1. Start The App

```bash
npm run dev
```

The local API should be available at:

```text
http://localhost:3000
```

## 2. Create Postman Variables

Create these variables in your Postman environment:

```text
baseUrl
adminEmailId
adminPassword
adminName
```

Set `baseUrl` to your running app URL. Set the admin values to the account you want to create.

## 3. Create The First Admin Account

Create a new Postman request:

```text
POST {{baseUrl}}/api/auth/register
```

Headers:

```text
Content-Type: application/json
```

Body:

```json
{
  "name": "{{adminName}}",
  "email": "{{adminEmailId}}",
  "password": "{{adminPassword}}",
  "role": "admin"
}
```

Expected response:

```json
{
  "id": "admin-id-from-database",
  "emailId": "admin-email-from-postman-variable",
  "name": "admin-name-from-postman-variable",
  "status": "active"
}
```

The password is hashed before it is saved. The response does not return the password.

## 4. Login As Admin

Create another Postman request:

```text
POST {{baseUrl}}/api/admin/auth/login
```

Headers:

```text
Content-Type: application/json
```

Body:

```json
{
  "emailId": "{{adminEmailId}}",
  "password": "{{adminPassword}}"
}
```

Expected response:

```json
{
  "ok": true
}
```

Postman should also receive an `admin_session` cookie.

## 5. Verify Admin Access

After login, send:

```text
GET {{baseUrl}}/api/admin/employees
```

Expected result:

```text
200 OK
```

## 6. Create More Admin Accounts

After the first admin exists, `POST /api/auth/register` requires an active `admin_session` cookie. Log in as an existing admin first, then send the same create-admin request with different Postman variable values.
