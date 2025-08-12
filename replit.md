# Backend Chatbot API Dashboard

## Overview
This is a full-stack TypeScript application providing the SOYOSOYO SACCO Assistant, a specialized chatbot backend service with OpenAI integration and an administrative dashboard. The system features a React frontend for monitoring and testing the chatbot API, and an Express.js backend for chat interactions, file processing, and analytics tracking tailored for SACCO services and member support. The project aims to provide document-specific AI responses, ensuring accuracy and preventing external knowledge contamination.

**Latest Update (Aug 2025):** Successfully deployed with SVG-based embeddable chat widgets for Google Sites integration, eliminating external image dependencies and ensuring reliable SOYOSOYO SACCO branding.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript (Vite)
- **UI Library**: Radix UI primitives with shadcn/ui styling
- **Styling**: Tailwind CSS
- **State Management**: TanStack Query (React Query)
- **Routing**: Wouter

### Backend
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript (ES modules)
- **API Design**: RESTful API
- **File Processing**: Multer for multipart uploads
- **Error Handling**: Centralized middleware

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM
- **Schema Management**: TypeScript with Zod validation
- **Connection**: Neon Database serverless connection
- **Fallback Storage**: In-memory for development

### Core Data Models
- Conversations, Messages, Files, API Logs

### Authentication and Authorization
- Basic session handling; no complex authentication implemented.

### AI Integration
- **OpenAI API**: GPT-4o model
- **SACCO Assistant Persona**: Specialized system prompts with ZERO general knowledge; responses strictly limited to uploaded SOYOSOYO SACCO documents.
- **File Processing**: Automated text extraction and analysis for uploaded documents and images.
- **Document-Only Knowledge**: System configured to refuse questions not directly answerable from uploaded documents.

### File Upload System
- **Supported Formats**: Text, PDFs, images (JPEG, PNG, GIF, WebP), Office documents, JSON, CSV.
- **Size Limits**: 10MB per file.
- **Processing**: Automatic text extraction, content analysis, metadata storage.
- **Storage**: Local file system with database metadata tracking.

### Embeddable Chat Widgets
- **Google Sites Integration**: Self-contained HTML with SVG-based SOYOSOYO SACCO logos
- **Universal Compatibility**: Works in any embedding environment without external dependencies
- **Professional Branding**: SOYOSOYO SACCO colors (#7dd3c0, #1e7b85) and styling throughout
- **Deployment Ready**: `google-sites-svg-embed.html` available at production URL

### Development Tools
- **Build System**: Vite, ESBuild
- **Type Safety**: TypeScript
- **Code Quality**: Strict TypeScript mode
- **Development Experience**: HMR, runtime error overlays

## External Dependencies

### Core Framework Dependencies
- `@neondatabase/serverless`
- `drizzle-orm`
- `drizzle-zod`
- `express`
- `multer`

### AI and Processing Services
- `OpenAI`

### Frontend UI Libraries
- `@radix-ui/*`
- `@tanstack/react-query`
- `react-hook-form`
- `@hookform/resolvers`

### Styling and Design
- `tailwindcss`
- `class-variance-authority`
- `clsx`

### Development and Build Tools
- `vite`
- `typescript`
- `tsx`
- `esbuild`

### Database and Validation
- `zod`
- `connect-pg-simple`
- `date-fns`