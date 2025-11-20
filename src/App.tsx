import { useState, useEffect } from 'react';
import { Calendar } from 'lucide-react';
import { LegalBanner } from './components/LegalBanner';
import { ScanForm } from './components/ScanForm';
import { ResultsPreview } from './components/ResultsPreview';
import { ConsultationModal } from './components/ConsultationModal';
import { supabase } from './lib/supabase';
import type { ScanResult } from './types/scan';

function App() {
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [showConsultationModal, setShowConsultationModal] = useState(false);

  useEffect(() => {
    if (!scanResult || scanResult.scan_status === 'completed' || scanResult.scan_status === 'failed') {
      return;
    }

    const pollInterval = setInterval(async () => {
      const { data } = await supabase
        .from('scan_results')
        .select('*')
        .eq('id', scanResult.id)
        .maybeSingle();

      if (data) {
        setScanResult(data as ScanResult);
        if (data.scan_status === 'completed' || data.scan_status === 'failed') {
          setScanning(false);
        }
      }
    }, 3000);

    return () => clearInterval(pollInterval);
  }, [scanResult]);

  const handleScan = async (url: string) => {
    setScanning(true);
    setScanResult(null);
    setErrorMessage('');

    try {
      const { data, error } = await supabase
        .from('scan_results')
        .insert({
          target_url: url,
          scan_status: 'pending'
        })
        .select()
        .single();

      if (error) throw error;

      setScanResult(data as ScanResult);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/web-scanner`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ scanId: data.id, url }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Scan initiation failed');
      }
    } catch (error) {
      console.error('Scan error:', error);
      setScanning(false);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to start scan. Please try again.');
    }
  };

  const handleNewScan = () => {
    setScanResult(null);
    setScanning(false);
    setErrorMessage('');
  };

  const handleEmailSubmit = async (email: string, optIn: boolean) => {
    if (!scanResult) return;

    const { error: insertError } = await supabase
      .from('email_submissions')
      .insert({
        scan_id: scanResult.id,
        email,
        opted_in_storage: optIn
      });

    if (insertError) throw insertError;

    await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-report`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ scanId: scanResult.id, email }),
      }
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <header className="sticky top-0 z-50 bg-white shadow-sm border-b border-gray-200">
        <div className="container mx-auto px-6 py-4">
          <div className="flex justify-between items-center max-w-7xl mx-auto">
            <button onClick={handleNewScan} className="cursor-pointer bg-transparent border-none p-0">
<<<<<<< HEAD
              <img src="/image.png" alt="RoboLab Logo" className="h-8 w-auto" />
=======
              <img src="/image copy.png" alt="RoboLab Logo" className="h-8 md:h-10 hover:opacity-80 transition-opacity" />
>>>>>>> d4476ce7ebf22932dc7966d5588c6034723814a1
            </button>
            <button
              onClick={() => setShowConsultationModal(true)}
              className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 font-medium text-sm md:text-base"
            >
              <Calendar className="w-4 h-4 md:w-5 md:h-5" />
              <span className="hidden sm:inline">Book Consultation</span>
              <span className="sm:hidden">Book</span>
            </button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        {!scanResult && (
          <div className="text-center mt-8 mb-16 px-4">
            <h1 className="text-3xl md:text-5xl font-bold text-gray-900 mb-4">
              Robo-Lab Web Scanner
            </h1>
            <p className="text-lg md:text-xl text-gray-600 max-w-2xl mx-auto">
              Comprehensive automated analysis for E2E, API, Security, Performance & Accessibility
            </p>
          </div>
        )}

        <ConsultationModal
          isOpen={showConsultationModal}
          onClose={() => setShowConsultationModal(false)}
        />

        <div className="flex flex-col items-center gap-8">
          {!scanResult && (
            <>
              <LegalBanner />
              <ScanForm onScan={handleScan} loading={scanning} />
              {errorMessage && (
                <div className="w-full max-w-3xl bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-red-800 text-center">{errorMessage}</p>
                </div>
              )}
            </>
          )}

          {scanResult && (
            <ResultsPreview
              result={scanResult}
              onEmailSubmit={handleEmailSubmit}
              onScanAnother={handleNewScan}
            />
          )}

          {!scanResult && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 w-full max-w-5xl mt-8">
              <FeatureCard
                icon="🔒"
                title="Security"
                description="TLS, HSTS, headers, cookie flags"
              />
              <FeatureCard
                icon="⚡"
                title="Performance"
                description="Lighthouse metrics, LCP, CLS, TBT"
              />
              <FeatureCard
                icon="👁️"
                title="Accessibility"
                description="WCAG compliance via axe-core"
              />
              <FeatureCard
                icon="🔌"
                title="API Analysis"
                description="Endpoints, status codes, hygiene"
              />
            </div>
          )}
        </div>

        <footer className="text-center mt-16 text-sm text-gray-500">
          <p>Non-intrusive scans only • Respects robots.txt • Results stored 30 days</p>
        </footer>
      </div>
    </div>
  );
}

interface FeatureCardProps {
  icon: string;
  title: string;
  description: string;
}

function FeatureCard({ icon, title, description }: FeatureCardProps) {
  return (
    <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
      <div className="text-4xl mb-3">{icon}</div>
      <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
      <p className="text-sm text-gray-600">{description}</p>
    </div>
  );
}

export default App;
