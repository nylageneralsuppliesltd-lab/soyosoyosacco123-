import { readFileSync } from 'fs';
import { processUploadedFile } from './server/services/fileProcessor.ts';

async function uploadToProduction() {
  const filePath = './attached_assets/Soyosoyo SACCO Audit tool_1757879830410.pdf';
  const fileName = 'Soyosoyo SACCO Audit tool_1757879830410.pdf';
  const mimeType = 'application/pdf';
  
  console.log('🔄 Processing PDF for production upload...');
  
  try {
    // Read the PDF file
    const fileBuffer = readFileSync(filePath);
    const fileSize = fileBuffer.length;
    
    console.log(`📄 File size: ${fileSize} bytes`);
    
    // Process the file to extract text and analysis
    const { extractedText, analysis } = await processUploadedFile(
      fileBuffer,
      fileName,
      mimeType
    );
    
    console.log(`📝 Extracted ${extractedText.length} characters`);
    console.log('🔍 Analysis preview:', analysis.substring(0, 200) + '...');
    
    // Upload to production via API
    const FormData = (await import('form-data')).default;
    const fetch = (await import('node-fetch')).default;
    
    const form = new FormData();
    form.append('file', fileBuffer, {
      filename: fileName,
      contentType: mimeType
    });
    
    console.log('🚀 Uploading to production...');
    
    const response = await fetch('https://soyosoyosacco-123-nylageneralsupp.replit.app/api/upload', {
      method: 'POST',
      body: form,
      headers: form.getHeaders()
    });
    
    const result = await response.text();
    console.log('📊 Production upload response:', result);
    
    if (response.ok) {
      console.log('✅ Successfully uploaded to production!');
      
      // Test the production API
      console.log('🧪 Testing production TAT query...');
      const testResponse = await fetch('https://soyosoyosacco-123-nylageneralsupp.replit.app/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'What are the TAT requirements for SOYOSOYO SACCO decision making?',
          includeContext: true
        })
      });
      
      const testResult = await testResponse.json();
      console.log('🎯 Production test result:', testResult.response.substring(0, 300) + '...');
      
    } else {
      console.error('❌ Production upload failed:', result);
    }
    
  } catch (error) {
    console.error('💥 Error:', error);
    throw error;
  }
}

// Run the upload
uploadToProduction()
  .then(() => {
    console.log('🎉 Production deployment complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Production deployment failed:', error);
    process.exit(1);
  });