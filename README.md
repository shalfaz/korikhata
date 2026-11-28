<h1 align="center">💰 KoriKhata (কড়িখাঁতা)</h1>
<p align="center">
  <b>Multi-Tenant BDT (৳) Financial Ledger & Expense Management SaaS Platform</b>
</p>
<p align="center">
  <a href="https://korikhata.vercel.app" target="_blank"><b>🌐 Live Demo</b></a> •
  <a href="https://github.com/shalfaz/korikhata" target="_blank"><b>💻 Source Code</b></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js_16-000000?style=for-the-badge&logo=nextdotjs&logoColor=white" alt="Next.js" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/MongoDB-47A248?style=for-the-badge&logo=mongodb&logoColor=white" alt="MongoDB" />
  <img src="https://img.shields.io/badge/NextAuth.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white" alt="NextAuth" />
  <img src="https://img.shields.io/badge/Cloudinary-3448C5?style=for-the-badge&logo=cloudinary&logoColor=white" alt="Cloudinary" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind CSS" />
</p>

<p align="center">
  <img src="https://shohanalfaz.vercel.app/korikhata_web.png" alt="KoriKhata Preview" width="80%" />
</p>

---

### 📌 Overview
**KoriKhata** is an enterprise-ready, multi-tenant financial ledger and expense management SaaS platform architected for **Elitebanga Group** to manage branch-level accounting across active client organizations (including **Shilpalay** and **Looklify**). Built with strict tenant data isolation, it eliminates manual spreadsheet errors and enforces financial accountability through structured approval workflows.

### ✨ Key Architecture & Features
- **Strict Multi-Tenant Data Isolation:** Complete organization-level data partitioning at the database query layer so client businesses operate independently on a shared infrastructure.
- **5-Tier Role-Based Access Control (RBAC):** Granular permission boundaries spanning `Super Admin`, `HQ Admin`, `Branch Admin`, `Branch Manager`, and `Employee/Staff`.
- **Maker-Checker Voucher Pipeline:** Prevents unauthorized expense entries by requiring branch-level voucher submissions to pass multi-stage verification before ledger posting.
- **Automated Receipt Compression:** Integrated **Cloudinary** pipelines for automatic image compression and CDN delivery of physical voucher receipts while keeping MongoDB document footprints lightweight.
- **BDT (`৳`) Financial Reporting:** Real-time branch cashflow tracking, expense categorization, and complete audit traceability.

### 🛠️ Tech Stack
- **Frontend:** Next.js 16 (App Router), React, TypeScript, Tailwind CSS
- **Backend & Database:** Next.js API Routes, MongoDB, Mongoose ODM
- **Authentication & Security:** NextAuth.js (Role-based session & middleware protection)
- **Media & Hosting:** Cloudinary, Vercel

### 🚀 Local Setup
```bash
git clone https://github.com/shalfaz/korikhata.git
cd korikhata
npm install
