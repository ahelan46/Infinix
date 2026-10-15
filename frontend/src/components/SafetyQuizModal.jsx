import React, { useState, useRef } from 'react';
import {
  Award,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  Flame,
  Printer,
  RotateCcw,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  X,
  Compass,
  Check,
  Share2,
  Copy
} from 'lucide-react';
import './SafetyQuizModal.css';

// 6 Comprehensive Building Safety Questions tailored to Block 4 layout
const QUIZ_QUESTIONS = [
  {
    id: 1,
    category: 'Fire Extinguishers',
    question: 'Where are the primary portable Fire Extinguisher (FE-2kg) stations located on the floor layout?',
    hint: 'Look at the central corridor blueprint markings marked with FE red badges.',
    options: [
      'Mounted along central main corridors near primary cross-junctions for immediate access',
      'Locked inside the basement electrical maintenance closet',
      'On the outdoor rooftop perimeter only',
      'Underneath private office computer desks'
    ],
    correctIndex: 0,
    explanation: 'FE-2kg fire extinguishers are installed along high-traffic central corridors on every floor so occupants can access them immediately along escape pathways without being cornered.'
  },
  {
    id: 2,
    category: 'Emergency Exits',
    question: 'How many primary ground-level emergency exits lead directly outside on the Ground Floor?',
    hint: 'Check the perimeter wall exits labeled A, B, C, and D.',
    options: [
      'Only 1 exit located exclusively at the main front entrance',
      '4 perimeter exits (Exit A-West, Exit B-East, Exit C-South, Exit D-North)',
      '2 window openings on the northern wall only',
      'Emergency egress is only possible through the subterranean parking garage'
    ],
    correctIndex: 1,
    explanation: 'The Ground Floor features 4 wide perimeter emergency exits (A, B, C, D) positioned North, South, East, and West to prevent bottlenecks and allow multi-directional escape.'
  },
  {
    id: 3,
    category: 'Vertical Evacuation',
    question: 'If you are on Floor 1, 2, or 3 during a fire alarm, which path is mandatory for safe vertical descent?',
    hint: 'Never use motorized elevators during fire emergencies.',
    options: [
      'Take the passenger elevator immediately for faster descent',
      'Use the designated fire-rated emergency stairwells (S1 to S4) down to the Ground Floor',
      'Break window glass and wait on the ledge',
      'Stay inside the nearest restroom and seal the door'
    ],
    correctIndex: 1,
    explanation: 'Elevators automatically shut down or ground during fire alarms to avoid shaft smoke inhalation and power failure entrapment. Always use pressurized emergency stairwells (S1–S4).'
  },
  {
    id: 4,
    category: 'Fire Extinguisher Protocol',
    question: 'What is the universally certified "P.A.S.S." operating sequence for discharging a fire extinguisher?',
    hint: 'An OSHA & NFPA standard acronym for extinguisher deployment.',
    options: [
      'Push lever, Activate water, Spray top of flames, Step back',
      'Pull the safety pin, Aim nozzle at the base of fire, Squeeze handle, Sweep side-to-side',
      'Press alarm button, Alert colleagues, Shake container, Shoot foam',
      'Pump handle repeatedly, Air out room, Soak floor, Stop'
    ],
    correctIndex: 1,
    explanation: 'P.A.S.S. stands for Pull the pin, Aim at the base (not top) of flames, Squeeze the operating handle, and Sweep side-to-side across the fire front.'
  },
  {
    id: 5,
    category: 'Active Hazard Re-routing',
    question: 'If an escape corridor is engulfed in radiant red fire or heavy smoke, what should you do?',
    hint: 'AEGIS autonomous routing calculates safe alternative pathways.',
    options: [
      'Re-route immediately to an alternate safe stairwell or secondary open exit',
      'Hold your breath and run directly through the flames',
      'Stop in the smoke and take photos for social media',
      'Prop open corridor fire doors to ventilate smoke into adjacent rooms'
    ],
    correctIndex: 0,
    explanation: 'Never attempt to traverse active fire or toxic smoke zones. Re-route immediately toward an uncompromised secondary stairwell or emergency exit.'
  },
  {
    id: 6,
    category: 'Post-Evacuation Protocol',
    question: 'Once you successfully exit the building into the open air, what is the mandatory next step?',
    hint: 'Roll-call and accountability prevent dangerous rescue entries.',
    options: [
      'Quickly re-enter the building to fetch your laptop or personal belongings',
      'Proceed immediately to the designated outdoor Assembly Point for headcount & roll-call',
      'Stand directly in front of the exit doorway to observe firefighters',
      'Immediately drive away before emergency vehicles arrive'
    ],
    correctIndex: 1,
    explanation: 'All occupants must assemble at the designated outdoor Assembly Area so safety wardens can account for all missing individuals and coordinate emergency teams safely.'
  }
];

export default function SafetyQuizModal({ isOpen, onClose }) {
  // Wizard steps: 'intro' | 'quiz' | 'result' | 'certificate'
  const [step, setStep] = useState('intro');
  const [userName, setUserName] = useState('');
  const [userFloor, setUserFloor] = useState('Ground Floor');
  const [userRole, setUserRole] = useState('Building Occupant');
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState({}); // { [questionId]: optionIndex }
  const [showExplanations, setShowExplanations] = useState(false);
  const [certId, setCertId] = useState('');
  const [issuedDate, setIssuedDate] = useState('');
  const [copiedId, setCopiedId] = useState(false);
  const certificateRef = useRef(null);

  if (!isOpen) return null;

  // Handle starting the quiz
  const handleStartQuiz = (e) => {
    e.preventDefault();
    if (!userName.trim()) return;
    setCurrentQuestionIndex(0);
    setSelectedAnswers({});
    setShowExplanations(false);
    setStep('quiz');
  };

  // Select an option
  const handleSelectOption = (qId, optionIdx) => {
    setSelectedAnswers(prev => ({
      ...prev,
      [qId]: optionIdx
    }));
  };

  // Submit and calculate score
  const calculateScore = () => {
    let correct = 0;
    QUIZ_QUESTIONS.forEach(q => {
      if (selectedAnswers[q.id] === q.correctIndex) {
        correct++;
      }
    });
    return correct;
  };

  const handleFinishQuiz = () => {
    const correctCount = calculateScore();
    const passed = correctCount >= 5; // Pass threshold: 5 out of 6 (83%)

    if (passed) {
      // Generate unique certificate ID
      const randomHash = Math.random().toString(36).substring(2, 8).toUpperCase();
      const generatedId = `AEGIS-SAFE-B4-${randomHash}`;
      const now = new Date();
      const dateStr = now.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      setCertId(generatedId);
      setIssuedDate(dateStr);
    }
    setStep('result');
  };

  // Print Certificate handler
  const handlePrintCertificate = () => {
    window.print();
  };

  const score = calculateScore();
  const totalQuestions = QUIZ_QUESTIONS.length;
  const scorePercent = Math.round((score / totalQuestions) * 100);
  const isPassed = score >= 5;
  const currentQ = QUIZ_QUESTIONS[currentQuestionIndex];

  return (
    <div className="quiz-modal-overlay" onClick={onClose}>
      <div className="quiz-modal-dialog" onClick={e => e.stopPropagation()}>

        {/* ------------------------------------------------------------------ */}
        {/* STEP 1: Registration / Intro */}
        {/* ------------------------------------------------------------------ */}
        {step === 'intro' && (
          <div className="quiz-step-card">
            <div className="quiz-header">
              <div className="quiz-badge-icon">
                <Award size={24} color="#f59e0b" />
              </div>
              <div style={{ flex: 1 }}>
                <h2 className="quiz-title">Fire Safety & Evacuation Certification</h2>
                <p className="quiz-subtitle">Block 4 Occupant Preparedness & Knowledge Test</p>
              </div>
              <button className="quiz-close-btn" onClick={onClose} title="Close">
                <X size={18} />
              </button>
            </div>

            <div className="quiz-intro-body">
              <div className="quiz-highlight-box">
                <div className="highlight-icon">
                  <Flame size={20} color="#ef4444" />
                </div>
                <div className="highlight-text">
                  <b>Know Your Block, Save Lives:</b> Test your knowledge on building <b>Fire Extinguisher Stations</b>, <b>Ground Exits (A–D)</b>, emergency stairwells, and evacuation re-routing.
                </div>
              </div>

              <div className="quiz-meta-grid">
                <div className="meta-item">
                  <span className="meta-label">Questions</span>
                  <span className="meta-val">6 Scenarios</span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">Pass Score</span>
                  <span className="meta-val">80% (5/6)</span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">Credential</span>
                  <span className="meta-val" style={{ color: '#fbbf24' }}>Official Certificate</span>
                </div>
              </div>

              <form onSubmit={handleStartQuiz} className="quiz-reg-form">
                <div className="form-group">
                  <label htmlFor="occupant-name">Your Full Name (Printed on Certificate) *</label>
                  <input
                    id="occupant-name"
                    type="text"
                    required
                    placeholder="e.g. Arun Kumar"
                    value={userName}
                    onChange={e => setUserName(e.target.value)}
                    className="quiz-input"
                    autoFocus
                  />
                </div>

                <div className="form-row">
                  <div className="form-group" style={{ flex: 1 }}>
                    <label htmlFor="occupant-floor">Assigned Floor</label>
                    <select
                      id="occupant-floor"
                      value={userFloor}
                      onChange={e => setUserFloor(e.target.value)}
                      className="quiz-select"
                    >
                      <option value="Ground Floor">Ground Floor</option>
                      <option value="Floor 1">Floor 1 (Level 1)</option>
                      <option value="Floor 2">Floor 2 (Level 2)</option>
                      <option value="Floor 3">Floor 3 (Level 3)</option>
                    </select>
                  </div>

                  <div className="form-group" style={{ flex: 1 }}>
                    <label htmlFor="occupant-role">Occupant Role</label>
                    <select
                      id="occupant-role"
                      value={userRole}
                      onChange={e => setUserRole(e.target.value)}
                      className="quiz-select"
                    >
                      <option value="Building Occupant">Building Occupant</option>
                      <option value="Resident / Tenant">Resident / Tenant</option>
                      <option value="Facility Staff / Engineer">Facility Staff / Engineer</option>
                      <option value="Emergency Floor Warden">Emergency Floor Warden</option>
                      <option value="Visitor / Guest">Visitor / Guest</option>
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!userName.trim()}
                  className="btn-start-quiz"
                >
                  <span>Begin Safety Certification Test</span>
                  <ArrowRight size={18} />
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* STEP 2: Active Quiz Questions */}
        {/* ------------------------------------------------------------------ */}
        {step === 'quiz' && (
          <div className="quiz-step-card">
            <div className="quiz-header">
              <div className="question-counter-badge">
                <span>{currentQuestionIndex + 1}</span> / {totalQuestions}
              </div>
              <div style={{ flex: 1 }}>
                <span className="quiz-category-tag">{currentQ.category}</span>
                <div className="quiz-progress-bar-bg">
                  <div
                    className="quiz-progress-bar-fill"
                    style={{ width: `${((currentQuestionIndex + 1) / totalQuestions) * 100}%` }}
                  ></div>
                </div>
              </div>
              <button className="quiz-close-btn" onClick={onClose} title="Cancel Quiz">
                <X size={18} />
              </button>
            </div>

            <div className="quiz-question-body">
              <h3 className="quiz-question-text">{currentQ.question}</h3>
              {currentQ.hint && (
                <div className="quiz-question-hint">
                  💡 <b>Tip:</b> {currentQ.hint}
                </div>
              )}

              <div className="quiz-options-list">
                {currentQ.options.map((optText, idx) => {
                  const isSelected = selectedAnswers[currentQ.id] === idx;
                  const optLetter = String.fromCharCode(65 + idx);
                  return (
                    <button
                      key={idx}
                      type="button"
                      className={`quiz-option-card ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleSelectOption(currentQ.id, idx)}
                    >
                      <span className="option-letter">{optLetter}</span>
                      <span className="option-text">{optText}</span>
                      <div className="option-check-circle">
                        {isSelected && <Check size={14} color="#ffffff" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="quiz-footer">
              <button
                type="button"
                className="btn-quiz-nav"
                disabled={currentQuestionIndex === 0}
                onClick={() => setCurrentQuestionIndex(i => i - 1)}
              >
                <ArrowLeft size={16} />
                <span>Previous</span>
              </button>

              {currentQuestionIndex < totalQuestions - 1 ? (
                <button
                  type="button"
                  className="btn-quiz-nav primary"
                  disabled={selectedAnswers[currentQ.id] === undefined}
                  onClick={() => setCurrentQuestionIndex(i => i + 1)}
                >
                  <span>Next Question</span>
                  <ArrowRight size={16} />
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-quiz-nav finish"
                  disabled={selectedAnswers[currentQ.id] === undefined}
                  onClick={handleFinishQuiz}
                >
                  <ShieldCheck size={16} />
                  <span>Submit & View Certificate</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* STEP 3: Results Summary */}
        {/* ------------------------------------------------------------------ */}
        {step === 'result' && (
          <div className="quiz-step-card">
            <div className="quiz-header">
              <div style={{ flex: 1 }}>
                <h2 className="quiz-title">Safety Test Evaluation</h2>
                <p className="quiz-subtitle">Candidate: {userName} · {userFloor}</p>
              </div>
              <button className="quiz-close-btn" onClick={onClose} title="Close">
                <X size={18} />
              </button>
            </div>

            <div className="quiz-result-body">
              <div className={`result-score-card ${isPassed ? 'passed' : 'failed'}`}>
                <div className="score-ring">
                  <span className="score-number">{score} / {totalQuestions}</span>
                  <span className="score-pct">{scorePercent}%</span>
                </div>
                <div className="score-verdict">
                  <h3 className="verdict-title">
                    {isPassed ? '🎉 CERTIFICATION EARNED!' : '⚠️ TEST NOT PASSED'}
                  </h3>
                  <p className="verdict-desc">
                    {isPassed
                      ? `Outstanding! You met the 80% passing standard. Your official Block 4 Fire Safety & Evacuation Credential is ready.`
                      : `You scored ${scorePercent}%. Minimum passing grade is 80% (5/6). Review the correct building answers below and retake to earn your certificate.`
                    }
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="result-actions">
                {isPassed ? (
                  <button
                    className="btn-view-certificate"
                    onClick={() => setStep('certificate')}
                  >
                    <Award size={18} />
                    <span>View & Print Official Certificate</span>
                  </button>
                ) : (
                  <button
                    className="btn-retake-quiz"
                    onClick={() => {
                      setSelectedAnswers({});
                      setCurrentQuestionIndex(0);
                      setStep('quiz');
                    }}
                  >
                    <RotateCcw size={16} />
                    <span>Retake Safety Test</span>
                  </button>
                )}

                <button
                  className="btn-toggle-explanations"
                  onClick={() => setShowExplanations(!showExplanations)}
                >
                  {showExplanations ? 'Hide Answer Review' : 'Review Questions & Detailed Answers'}
                </button>
              </div>

              {/* Detailed Review Section */}
              {showExplanations && (
                <div className="quiz-review-section">
                  <h4 className="review-heading">Detailed Scenario Review</h4>
                  <div className="review-list">
                    {QUIZ_QUESTIONS.map((q, idx) => {
                      const userAns = selectedAnswers[q.id];
                      const isCorrect = userAns === q.correctIndex;
                      return (
                        <div key={q.id} className={`review-card ${isCorrect ? 'correct' : 'incorrect'}`}>
                          <div className="review-card-header">
                            <span className="review-badge">Q{idx + 1} · {q.category}</span>
                            {isCorrect ? (
                              <span className="status-badge correct"><CheckCircle2 size={14} /> Correct</span>
                            ) : (
                              <span className="status-badge incorrect"><XCircle size={14} /> Incorrect</span>
                            )}
                          </div>
                          <p className="review-q-text">{q.question}</p>
                          <div className="review-answer-line">
                            <b>Correct Answer:</b> {q.options[q.correctIndex]}
                          </div>
                          <div className="review-expl">
                            ℹ️ {q.explanation}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* STEP 4: Official Certificate of Safety Preparedness */}
        {/* ------------------------------------------------------------------ */}
        {step === 'certificate' && (
          <div className="quiz-step-card cert-card-parent">
            {/* Action Bar (Hidden in Print) */}
            <div className="cert-toolbar no-print">
              <button
                className="btn-cert-nav"
                onClick={() => setStep('result')}
              >
                <ArrowLeft size={16} /> Back to Results
              </button>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className="btn-cert-print"
                  onClick={handlePrintCertificate}
                  title="Print or Save as PDF"
                >
                  <Printer size={16} /> Print / Save PDF
                </button>
                <button
                  className="quiz-close-btn"
                  onClick={onClose}
                  title="Close"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* The Printable Certificate */}
            <div className="certificate-frame-container" ref={certificateRef}>
              <div className="certificate-inner-border">
                
                {/* Guilloche Corner Accents */}
                <div className="corner-accent top-left"></div>
                <div className="corner-accent top-right"></div>
                <div className="corner-accent bottom-left"></div>
                <div className="corner-accent bottom-right"></div>

                {/* Header Crest */}
                <div className="cert-header">
                  <div className="cert-crests">
                    <ShieldCheck size={42} color="#f59e0b" />
                  </div>
                  <span className="cert-org-title">AEGIS SMART MUNICIPAL LIFE SAFETY ALLIANCE</span>
                  <h1 className="cert-main-title">Certificate of Safety Preparedness</h1>
                  <span className="cert-sub-title">BLOCK 4 FIRE SUPPRESSION & EVACUATION PROTOCOL</span>
                </div>

                {/* Recipient Statement */}
                <div className="cert-body">
                  <p className="cert-statement-lead">THIS IS TO CERTIFY THAT</p>
                  <div className="cert-recipient-name">{userName}</div>
                  <p className="cert-statement-body">
                    has successfully demonstrated verified competency in <b>Block 4 Building Fire Safety Topologies</b>,
                    including rapid identification of <b>Corridor Fire Extinguishers (FE-2kg)</b>, <b>Perimeter Ground Exits (A, B, C, D)</b>,
                    <b>P.A.S.S. Suppression Protocols</b>, and <b>Autonomous Dynamic Evacuation Re-routing</b>.
                  </p>
                </div>

                {/* Credentials Matrix */}
                <div className="cert-meta-grid">
                  <div className="cert-meta-box">
                    <span className="cert-meta-k">FACILITY</span>
                    <span className="cert-meta-v">Block 4 Smart Complex</span>
                  </div>
                  <div className="cert-meta-box">
                    <span className="cert-meta-k">ASSIGNED ZONE</span>
                    <span className="cert-meta-v">{userFloor}</span>
                  </div>
                  <div className="cert-meta-box">
                    <span className="cert-meta-k">DATE ISSUED</span>
                    <span className="cert-meta-v">{issuedDate}</span>
                  </div>
                  <div className="cert-meta-box">
                    <span className="cert-meta-k">FINAL SCORE</span>
                    <span className="cert-meta-v" style={{ color: '#059669', fontWeight: 800 }}>{scorePercent}% (DISTINCTION)</span>
                  </div>
                </div>

                {/* Signatures & Holographic Gold Seal */}
                <div className="cert-signatures-row">
                  <div className="cert-sig-block">
                    <div className="cert-sig-line">Dr. Ronald V. Keller</div>
                    <span className="cert-sig-role">Chief Fire Safety Officer · AEGIS</span>
                  </div>

                  {/* Golden Holographic Verification Seal */}
                  <div className="cert-gold-seal">
                    <div className="seal-outer-ring">
                      <div className="seal-inner-star">
                        <Sparkles size={20} color="#78350f" />
                      </div>
                      <span className="seal-text-top">OFFICIAL SEAL</span>
                      <span className="seal-text-bottom">VERIFIED SAFE</span>
                    </div>
                  </div>

                  <div className="cert-sig-block">
                    <div className="cert-sig-line">Maya S. Ramanathan</div>
                    <span className="cert-sig-role">Facility Emergency Evacuation Director</span>
                  </div>
                </div>

                {/* Verification ID Code */}
                <div className="cert-footer-verification">
                  <span>Certificate ID: <b>{certId}</b></span>
                  <span>•</span>
                  <span>Digitally Encrypted & Logged in AEGIS SQLite Registry</span>
                </div>

              </div>
            </div>

            {/* Print Helper Instructions */}
            <div className="cert-print-hint no-print">
              <span>💡 <b>Print Tip:</b> Click "Print / Save PDF" to produce a framable high-resolution certificate for your building records.</span>
              <button
                className="btn-copy-id"
                onClick={() => {
                  navigator.clipboard.writeText(certId);
                  setCopiedId(true);
                  setTimeout(() => setCopiedId(false), 2000);
                }}
              >
                <Copy size={13} /> {copiedId ? 'ID Copied!' : 'Copy Certificate ID'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
