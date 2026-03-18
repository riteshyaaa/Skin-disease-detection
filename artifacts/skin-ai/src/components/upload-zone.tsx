import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { UploadCloud, ImageIcon, X, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface UploadZoneProps {
  onUpload: (file: File) => void;
  isAnalyzing: boolean;
}

export function UploadZone({ onUpload, isAnalyzing }: UploadZoneProps) {
  const [preview, setPreview] = useState<string | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      const objectUrl = URL.createObjectURL(file);
      setPreview(objectUrl);
      onUpload(file);
    }
  }, [onUpload]);

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': [],
      'image/png': [],
      'image/webp': []
    },
    maxFiles: 1,
    disabled: isAnalyzing
  });

  const clearImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPreview(null);
  };

  return (
    <div className="w-full">
      <div
        {...getRootProps()}
        className={cn(
          "relative group cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed transition-all duration-300 ease-out",
          preview ? "p-1 border-transparent bg-slate-900" : "p-12",
          isDragActive && !preview ? "border-primary bg-primary/5 scale-[1.02]" : "border-border hover:border-primary/50 hover:bg-slate-50",
          isDragReject ? "border-danger bg-danger/5" : "",
          isAnalyzing ? "pointer-events-none opacity-90" : ""
        )}
      >
        <input {...getInputProps()} />

        <AnimatePresence mode="wait">
          {preview ? (
            <motion.div
              key="preview"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full aspect-square md:aspect-[4/3] rounded-xl overflow-hidden"
            >
              <img 
                src={preview} 
                alt="Preview" 
                className="w-full h-full object-cover transition-transform duration-700 hover:scale-105"
              />
              
              {/* Overlay while analyzing */}
              {isAnalyzing && (
                <>
                  <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm flex flex-col items-center justify-center z-10">
                    <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
                    <h3 className="text-white font-display font-bold text-xl">Analyzing Skin Pattern...</h3>
                    <p className="text-slate-300 mt-2 text-sm">Our AI is processing the image.</p>
                  </div>
                  
                  {/* Sci-fi scanner line */}
                  <motion.div
                    animate={{ top: ["0%", "100%", "0%"] }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
                    className="absolute left-0 right-0 h-1 bg-primary shadow-[0_0_20px_rgba(13,148,136,1)] z-20"
                  />
                </>
              )}

              {!isAnalyzing && (
                <button
                  onClick={clearImage}
                  className="absolute top-4 right-4 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full backdrop-blur-md transition-colors z-30"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="upload-prompt"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center text-center"
            >
              <div className="w-20 h-20 mb-6 rounded-full bg-primary/10 flex items-center justify-center group-hover:scale-110 group-hover:bg-primary/20 transition-all duration-300">
                <UploadCloud className="w-10 h-10 text-primary" />
              </div>
              <h3 className="text-xl font-display font-bold text-foreground mb-2">
                {isDragActive ? "Drop image here" : "Upload Skin Image"}
              </h3>
              <p className="text-muted-foreground text-sm max-w-sm mx-auto mb-6">
                Drag and drop a clear, well-lit photo of the skin condition, or click to browse files.
              </p>
              
              <div className="flex items-center gap-2 text-xs font-medium text-slate-400 bg-slate-100 px-3 py-1.5 rounded-full">
                <ImageIcon className="w-3.5 h-3.5" />
                Supports JPG, PNG, WEBP
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
