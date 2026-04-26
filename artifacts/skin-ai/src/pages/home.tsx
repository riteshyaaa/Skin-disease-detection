import { useState } from "react";
import { Layout } from "@/components/layout";
import { UploadZone } from "@/components/upload-zone";
import { ResultsCard } from "@/components/results-card";
import { useAnalyzeSkin } from "@/hooks/use-predictions";
import { fileToBase64 } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const { mutate: analyze, isPending, data: result, reset } = useAnalyzeSkin();
  const { toast } = useToast();

  const handleUpload = async (uploadedFile: File) => {
    setFile(uploadedFile);
    try {
      const base64 = await fileToBase64(uploadedFile);
      analyze(
        { 
          data: {
            imageBase64: base64,
            fileName: uploadedFile.name
          }
        },
        {
          onError: (error) => {
            toast({
              title: "Analysis Failed",
              description: error.message || "Something went wrong during prediction.",
              variant: "destructive"
            });
            setFile(null); // reset UI on error
          }
        }
      );
    } catch (err) {
      toast({
        title: "File Error",
        description: "Failed to process the uploaded image.",
        variant: "destructive"
      });
      setFile(null);
    }
  };

  const handleReset = () => {
    setFile(null);
    reset();
  };

  return (
    <Layout>
      {!result ? (
        <div className="max-w-4xl mx-auto pt-10 pb-20">
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-6xl font-display font-extrabold text-slate-900 mb-6 tracking-tight">
              Skin Disease Analysis
            </h1>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
              Upload an image of a skin concern. Our advanced neural network will analyze 
              patterns, assess severity, and provide actionable clinical insights.
            </p>
          </div>

          <div className="bg-white rounded-3xl shadow-2xl shadow-slate-200/50 p-2 md:p-6 border border-slate-100">
            <UploadZone onUpload={handleUpload} isAnalyzing={isPending} />
          </div>

          <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 text-center px-4">
            <div>
              <div className="text-3xl font-display font-bold text-primary mb-2">95%</div>
              <p className="text-sm text-slate-500">Pattern Recognition Accuracy</p>
            </div>
            <div>
              <div className="text-3xl font-display font-bold text-primary mb-2">&lt; 10s</div>
              <p className="text-sm text-slate-500">Average Processing Time</p>
            </div>
            <div>
              <div className="text-3xl font-display font-bold text-primary mb-2">15+</div>
              <p className="text-sm text-slate-500">Conditions Detected</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="max-w-5xl mx-auto pb-20">
          <ResultsCard result={result} onReset={handleReset} />
        </div>
      )}
    </Layout>
  );
}
