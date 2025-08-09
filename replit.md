# Backend Chatbot API Dashboard

## Overview

This is a full-stack TypeScript application that provides a chatbot backend service with OpenAI integration, file upload capabilities, and an administrative dashboard. The system features a React frontend for monitoring and testing the chatbot API, with an Express.js backend that handles chat interactions, file processing, and analytics tracking.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript using Vite as the build tool
- **UI Library**: Comprehensive component library built on Radix UI primitives with shadcn/ui styling
- **Styling**: Tailwind CSS with custom CSS variables for theming
- **State Management**: TanStack Query (React Query) for server state management and caching
- **Routing**: Wouter for lightweight client-side routing

### Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ES modules
- **API Design**: RESTful API with endpoints for chat, file upload, and monitoring
- **File Processing**: Multer middleware for handling multipart uploads with support for various file types (images, documents, text files)
- **Error Handling**: Centralized error middleware with structured error responses

### Data Storage Solutions
- **Database**: PostgreSQL with Drizzle ORM for type-safe database operations
- **Schema Management**: Database schema defined in shared TypeScript files with Zod validation
- **Connection**: Neon Database serverless connection for cloud PostgreSQL hosting
- **Fallback Storage**: In-memory storage implementation for development/testing scenarios

### Core Data Models
- **Conversations**: Track chat sessions with titles and timestamps
- **Messages**: Store individual chat messages with role-based categorization (user/assistant/system)
- **Files**: Manage uploaded files with metadata, processing status, and extracted content
- **API Logs**: Monitor system performance with endpoint usage, response times, and error tracking

### Authentication and Authorization
- **Session Management**: Basic session handling without complex authentication (suitable for internal/demo use)
- **API Security**: No authentication layer implemented - designed for internal or development use

### AI Integration
- **OpenAI API**: Integration with GPT-4o model for chat responses and file analysis
- **File Processing**: Automated text extraction and analysis for uploaded documents and images
- **Context Management**: Conversation history and file content used to enhance AI responses

### File Upload System
- **Supported Formats**: Text files, PDFs, images (JPEG, PNG, GIF, WebP), Office documents, JSON, CSV
- **Size Limits**: 10MB maximum file size per upload
- **Processing Pipeline**: Automatic text extraction, content analysis, and metadata storage
- **Storage**: Local file system storage with database metadata tracking

### Development Tools
- **Build System**: Vite for fast development and optimized production builds
- **Type Safety**: Comprehensive TypeScript configuration with strict mode enabled
- **Code Quality**: ESBuild for server bundling and production optimization
- **Development Experience**: Hot module replacement and runtime error overlays

## External Dependencies

### Core Framework Dependencies
- **@neondatabase/serverless**: Serverless PostgreSQL database connection for cloud hosting
- **drizzle-orm**: Type-safe ORM with PostgreSQL dialect support
- **drizzle-zod**: Integration between Drizzle and Zod for schema validation
- **express**: Web application framework for Node.js
- **multer**: Middleware for handling multipart/form-data file uploads

### AI and Processing Services
- **OpenAI**: Chat completions API for AI responses and file analysis
- **File Processing**: Built-in Node.js modules for text extraction and image processing

### Frontend UI Libraries
- **@radix-ui/***: Comprehensive set of unstyled, accessible UI components
- **@tanstack/react-query**: Powerful data synchronization library for React
- **react-hook-form**: Forms library with validation support
- **@hookform/resolvers**: Validation resolvers for react-hook-form

### Styling and Design
- **tailwindcss**: Utility-first CSS framework
- **class-variance-authority**: Utility for creating type-safe component variants
- **clsx**: Utility for constructing className strings conditionally

### Development and Build Tools
- **vite**: Fast build tool and development server
- **typescript**: Static type checking for JavaScript
- **tsx**: TypeScript execution environment for Node.js
- **esbuild**: Fast JavaScript bundler for production builds

### Database and Validation
- **zod**: TypeScript-first schema validation library
- **connect-pg-simple**: PostgreSQL session store for Express sessions
- **date-fns**: Modern JavaScript date utility library