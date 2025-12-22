import { useState, useRef, useEffect } from 'react';
import { X, Calendar, Loader2 } from 'lucide-react';

interface ConsultationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ConsultationModal({ isOpen, onClose }: ConsultationModalProps) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Handle Escape key to close modal
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    // Focus close button for accessibility
    closeButtonRef.current?.focus();

    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!fullName.trim()) {
      setError('Please enter your full name');
      return;
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setSubmitting(true);

    try {
      window.location.href = `https://timerex.net/s/sales_5e77_b801/482a66cf?apiKey=1ufKAEnDi4T0pk5lftqMqjiNmF5SQh8x3Va4pLe5oitNLtgKCuI7BKH5sI0SGLeI&name=${encodeURIComponent(fullName)}&email=${encodeURIComponent(email)}`;
    } catch (e) {
      console.error(e);
      setError('Something went wrong. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="consultation-modal-title"
    >
      <div className="bg-white rounded-lg shadow-2xl max-w-md w-full p-6 relative">
        <button
          ref={closeButtonRef}
          onClick={onClose}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onClose();
            }
          }}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded"
          aria-label="Close consultation modal"
          title="Close (Esc)"
        >
          <X className="w-6 h-6" />
        </button>

        <div className="text-center mb-6">
          <Calendar className="w-12 h-12 text-blue-600 mx-auto mb-3" aria-hidden="true" />
          <h1 id="consultation-modal-title" className="text-2xl font-bold text-gray-900 mb-2">Book a Consultation</h1>
          <p className="text-gray-600">
            Schedule a 12-minute QA consultation with our experts
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" aria-label="Consultation booking form">
          <div>
            <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1">
              Full Name <span aria-label="required">*</span>
            </label>
            <input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  (e.target as HTMLInputElement).form?.requestSubmit();
                }
              }}
              placeholder="John Doe"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              disabled={submitting}
              required
              aria-required="true"
              aria-label="Your full name"
              aria-describedby={error ? "form-error" : undefined}
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email Address <span aria-label="required">*</span>
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  (e.target as HTMLInputElement).form?.requestSubmit();
                }
              }}
              placeholder="john@example.com"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              disabled={submitting}
              required
              aria-required="true"
              aria-label="Your email address"
              aria-describedby={error ? "form-error" : undefined}
            />
          </div>

          {error && (
            <p id="form-error" className="text-red-600 text-sm" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !submitting) {
                handleSubmit(e as any);
              }
            }}
            className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            aria-label={submitting ? 'Scheduling consultation' : 'Schedule consultation'}
            aria-busy={submitting ? "true" : "false"}
          >
            {submitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Redirecting...
              </>
            ) : (
              <>
                <Calendar className="w-5 h-5" />
                Continue to Schedule
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
