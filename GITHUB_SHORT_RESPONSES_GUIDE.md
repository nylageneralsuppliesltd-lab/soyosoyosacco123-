# GitHub Deployment - Short OpenAI Responses Configuration

## ✅ Changes Made for Short Responses

### 1. Modified `server/services/openai.ts`

**Key Changes:**
- **max_tokens**: Reduced from 1000 → 50 tokens (much shorter responses)
- **System prompt**: Enforces 1-2 sentence maximum responses
- **Temperature**: Lowered to 0.1 for consistency

**System Prompt Change:**
```typescript
content: `You are SOYOSOYO SACCO Assistant. CRITICAL: Responses must be 1-2 sentences maximum. Never exceed 3 sentences.

Use uploaded documents first, then brief general SACCO info. For details: visit soyosoyosacco.com.

EXAMPLE SHORT RESPONSE: "SACCOs typically offer personal, business, and emergency loans. Visit soyosoyosacco.com for specific SOYOSOYO loan details."`
```

**User Prompt Addition:**
```typescript
content: `${userMessage}

INSTRUCTION: Answer in exactly 1-2 sentences only. Do not list items. Be extremely brief.`
```

### 2. Modified `server/index.ts`

**File Preloading Disabled:**
```typescript
async function preloadAssets() {
  console.log("DEBUG: Skipping asset preloading to conserve OpenAI quota");
  // Disabled to prevent OpenAI quota exhaustion during server startup
  // Files can still be uploaded via the UI when needed
}
```

## 🔄 To Apply to GitHub Repository

### Manual Git Commands:
```bash
# Remove git lock (if exists)
rm -f .git/index.lock

# Stage the changes
git add server/services/openai.ts server/index.ts

# Commit the changes
git commit -m "Configure OpenAI for short responses

- Reduce max_tokens from 1000 to 50 for concise answers
- Update system prompt to enforce 1-2 sentence responses  
- Disable resource-heavy file preloading to conserve quota
- Add explicit instructions for brief, focused responses"

# Push to GitHub
git push origin main
```

### Alternative: Manual File Updates

If you prefer to manually update GitHub files, copy these exact changes:

1. **In `server/services/openai.ts`:**
   - Line 20-24: Update system prompt (see above)
   - Line 57: Change `max_tokens: 1000` → `max_tokens: 50`
   - Line 58: Change `temperature: 0.3` → `temperature: 0.1`
   - Line 50: Add instruction text (see above)

2. **In `server/index.ts`:**
   - Lines 17-21: Replace preloadAssets function (see above)

## ✅ Expected Results

**Before:** Long paragraph responses (200+ words)
**After:** Short responses like: "SOYOSOYO SACCO typically offers personal, business, and emergency loans. Visit soyosoyosacco.com for specific details."

Your GitHub deployment will now provide the same concise, user-friendly responses as the current Replit environment.