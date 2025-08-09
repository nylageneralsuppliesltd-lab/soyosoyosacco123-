import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { CloudUpload, FileText, Image, X, CheckCircle, AlertCircle } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface FileUploadProps {
  expanded?: boolean;
}

interface UploadedFileResult {
  fileId?: string;
  fileName: string;
  size?: number;
  mimeType?: string;
  extractedText?: string;
  analysis?: string;
  processed: boolean;
  error?: string;
}

export default function FileUpload({ expanded = false }: FileUploadProps) {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFileResult[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: async (files: FileList) => {
      const formData = new FormData();
      Array.from(files).forEach(file => {
        formData.append("files", file);
      });

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      return response.json();
    },
    onSuccess: (data) => {
      setUploadedFiles(prev => [...prev, ...data.results]);
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: "Success",
        description: "Files uploaded and processed successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Upload Failed",
        description: error instanceof Error ? error.message : "Failed to upload files",
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    // Validate file size (10MB limit)
    const maxSize = 10 * 1024 * 1024;
    const validFiles = Array.from(files).filter(file => {
      if (file.size > maxSize) {
        toast({
          title: "File too large",
          description: `${file.name} exceeds 10MB limit`,
          variant: "destructive",
        });
        return false;
      }
      return true;
    });

    if (validFiles.length > 0) {
      const fileList = new DataTransfer();
      validFiles.forEach(file => fileList.items.add(file));
      uploadMutation.mutate(fileList.files);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const getFileIcon = (mimeType?: string) => {
    if (mimeType?.startsWith("image/")) {
      return <Image className="h-5 w-5 text-blue-500" />;
    }
    return <FileText className="h-5 w-5 text-red-500" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="p-6 border-b border-slate-200">
        <h3 className="text-lg font-semibold text-slate-900">File Upload Testing</h3>
        <p className="text-slate-600 text-sm mt-1">Test file upload and processing capabilities</p>
      </div>
      
      <div className="p-6">
        <div className={`grid grid-cols-1 ${expanded ? "lg:grid-cols-1" : "lg:grid-cols-2"} gap-8`}>
          {/* Upload Area */}
          <div>
            <h4 className="font-medium text-slate-900 mb-4">Upload Files</h4>
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
                dragOver
                  ? "border-blue-400 bg-blue-50"
                  : "border-slate-300 hover:border-slate-400"
              }`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={triggerFileSelect}
            >
              <CloudUpload className="h-12 w-12 text-slate-400 mx-auto mb-4" />
              <p className="text-lg font-medium text-slate-900 mb-2">
                Drop files here or click to upload
              </p>
              <p className="text-sm text-slate-500">
                Supports documents, images, and text files up to 10MB
              </p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => handleFileSelect(e.target.files)}
                accept=".txt,.pdf,.doc,.docx,.json,.csv,.jpg,.jpeg,.png,.gif,.webp"
              />
            </div>

            {uploadMutation.isPending && (
              <div className="mt-4">
                <div className="flex items-center justify-between text-sm text-slate-600 mb-2">
                  <span>Uploading files...</span>
                  <span>Processing</span>
                </div>
                <Progress value={50} className="h-2" />
              </div>
            )}

            {/* Uploaded Files List */}
            {uploadedFiles.length > 0 && (
              <div className="mt-4 space-y-2">
                {uploadedFiles.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border"
                  >
                    <div className="flex items-center space-x-3">
                      {getFileIcon(file.mimeType)}
                      <div>
                        <p className="text-sm font-medium text-slate-900">{file.fileName}</p>
                        <p className="text-xs text-slate-500">
                          {file.size ? formatFileSize(file.size) : "Unknown size"} • 
                          {file.processed ? " Processed" : " Failed"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {file.processed ? (
                        <Badge className="bg-green-100 text-green-800">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Success
                        </Badge>
                      ) : (
                        <Badge className="bg-red-100 text-red-800">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Failed
                        </Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFile(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Processing Results */}
          {(!expanded || uploadedFiles.length > 0) && (
            <div>
              <h4 className="font-medium text-slate-900 mb-4">Processing Results</h4>
              
              {uploadedFiles.length === 0 ? (
                <div className="bg-slate-900 text-slate-100 rounded-lg p-4 font-mono text-sm">
                  <div className="flex items-center space-x-2 mb-2">
                    <div className="w-2 h-2 bg-slate-500 rounded-full"></div>
                    <span className="text-slate-400">Waiting for files...</span>
                  </div>
                  <pre className="text-slate-500 text-xs">
                    Upload files to see processing results here
                  </pre>
                </div>
              ) : (
                <div className="space-y-4">
                  {uploadedFiles.map((file, index) => (
                    file.processed && (
                      <div key={index} className="bg-slate-900 text-slate-100 rounded-lg p-4 font-mono text-sm">
                        <div className="flex items-center space-x-2 mb-2">
                          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                          <span className="text-green-400">Processing completed</span>
                        </div>
                        <pre className="text-slate-300 text-xs whitespace-pre-wrap">
                          {JSON.stringify({
                            status: "success",
                            fileId: file.fileId,
                            fileName: file.fileName,
                            extractedText: file.extractedText?.substring(0, 100) + "...",
                            analysis: file.analysis?.substring(0, 200) + "...",
                            metadata: {
                              size: file.size ? formatFileSize(file.size) : "Unknown",
                              type: file.mimeType || "Unknown"
                            }
                          }, null, 2)}
                        </pre>
                      </div>
                    )
                  ))}
                </div>
              )}

              {/* File Statistics */}
              <div className="mt-4">
                <h5 className="font-medium text-slate-900 mb-2">File Statistics</h5>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <p className="text-blue-600 font-medium">Total Files</p>
                    <p className="text-xl font-semibold text-blue-900">{uploadedFiles.length}</p>
                  </div>
                  <div className="p-3 bg-green-50 rounded-lg">
                    <p className="text-green-600 font-medium">Success Rate</p>
                    <p className="text-xl font-semibold text-green-900">
                      {uploadedFiles.length > 0 
                        ? Math.round((uploadedFiles.filter(f => f.processed).length / uploadedFiles.length) * 100)
                        : 0
                      }%
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
