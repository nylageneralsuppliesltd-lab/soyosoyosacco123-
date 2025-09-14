# SOYOSOYO SACCO Assistant

A full-stack TypeScript chatbot backend service with OpenAI integration and administrative dashboard. Features document-based AI responses, PDF processing capabilities, and embeddable chat widgets for Google Sites.

## Features

- **Document-Based AI Responses**: Specialized SOYOSOYO SACCO assistant with zero external knowledge contamination
- **PDF Processing**: Automated text extraction and analysis for uploaded documents  
- **Production Ready**: Deployed with 24/7 uptime using free tier services
- **Embeddable Widgets**: SVG-based chat widgets for Google Sites integration
- **TAT Policy Integration**: Includes complete Turnaround Time policies for decision-making

## Tech Stack

### Frontend
- React 18 with TypeScript
- Radix UI with shadcn/ui
- Tailwind CSS
- TanStack Query
- Wouter routing

### Backend  
- Node.js with Express
- PostgreSQL with Drizzle ORM
- OpenAI API integration
- File processing with PDF support

## Quick Start

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up environment variables:
   ```bash
   DATABASE_URL=your_postgres_url
   OPENAI_API_KEY=your_openai_key
   ```

3. Run the application:
   ```bash
   npm run dev
   ```

## Deployment

The application is configured for production deployment with:
- Production database: `ep-mute-paper-ad3jo42e`
- Development database: `ep-hidden-silence-adpr6x7j`
- Google Sites HTML embed: `public/google-sites-svg-embed.html`

## Architecture

- **Frontend**: React dashboard for monitoring and testing
- **Backend**: Express API with OpenAI integration
- **Database**: PostgreSQL with automated file processing
- **Embedding**: Self-contained HTML widgets with SVG assets

## License

MIT
