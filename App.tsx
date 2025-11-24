import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Brain, Trophy, ChevronRight, CheckCircle2, XCircle, BarChart3, RotateCcw, ArrowRight, Activity, Zap } from 'lucide-react';
import { generateAdaptiveQuestions } from './services/geminiService';
import { AppStatus, Question, QuizHistoryItem } from './types';
import { Button } from './components/Button';
import { ProficiencyChart } from './components/ProficiencyChart';

const App: React.FC = () => {
  // Application State
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState(50); // Start at average (50/100)
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [history, setHistory] = useState<QuizHistoryItem[]>([]);
  
  // Queue System
  const [questionQueue, setQuestionQueue] = useState<Question[]>([]);
  const [isLoadingInitial, setIsLoadingInitial] = useState(false);
  const [isPrefetching, setIsPrefetching] = useState(false);

  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [feedbackShown, setFeedbackShown] = useState(false);
  
  // To prevent double firing in React Strict Mode
  const prefetchingRef = useRef(false);

  // --- Logic ---

  const calculateNewDifficulty = (current: number, isCorrect: boolean): number => {
    // ELO-like simplified adjustment
    if (isCorrect) {
      const boost = Math.max(2, 10 * (1 - current / 110)); 
      return Math.min(100, Math.round(current + boost));
    } else {
      const penalty = Math.max(3, 8 * (current / 100)); 
      return Math.max(0, Math.round(current - penalty));
    }
  };

  /**
   * Fetches questions and adds them to the queue.
   * Increased batch sizes for better buffering:
   * Initial load: 5 questions
   * Refill: 5 questions (increased from 3)
   */
  const fetchQuestionsToQueue = useCallback(async (
    currentTopic: string, 
    currentDiff: number, 
    count: number,
    isInitialLoad: boolean = false
  ) => {
    // If a request is already in flight, we generally skip to avoid duplicates/race conditions.
    // However, if we are in a "blocking" state (isInitialLoad=true) but a background request 
    // is running, we simply let the background request finish and populate the queue.
    // The useEffect hook below handles the UI recovery.
    if (prefetchingRef.current) return;
    
    prefetchingRef.current = true;
    
    if (isInitialLoad) setIsLoadingInitial(true);
    else setIsPrefetching(true);

    try {
      const previousSubTopics = history.slice(-5).map(h => h.question);
      const newQuestions = await generateAdaptiveQuestions(currentTopic, currentDiff, previousSubTopics, count);
      
      setQuestionQueue(prev => [...prev, ...newQuestions]);
      
      // If this was the initial load, immediately pop the first one
      if (isInitialLoad && newQuestions.length > 0) {
        setCurrentQuestion(newQuestions[0]);
        setQuestionQueue(newQuestions.slice(1));
      }
    } catch (e) {
      console.error(e);
    } finally {
      if (isInitialLoad) setIsLoadingInitial(false);
      else setIsPrefetching(false);
      prefetchingRef.current = false;
    }
  }, [history]);

  // CRITICAL FIX: Safety mechanism to recover from "Loading..." state
  // If the user hits "Next" while the queue is empty but a background fetch is running,
  // isLoadingInitial becomes true. When the background fetch finishes, it updates 
  // questionQueue but might not turn off isLoadingInitial. This effect fixes that.
  useEffect(() => {
    if (isLoadingInitial && questionQueue.length > 0) {
      // If we were waiting for questions and they arrived:
      // 1. Take the first one as current
      const nextQ = questionQueue[0];
      setCurrentQuestion(nextQ);
      setQuestionQueue(prev => prev.slice(1));
      // 2. Stop loading
      setIsLoadingInitial(false);
    }
  }, [questionQueue, isLoadingInitial]);

  const startQuiz = () => {
    if (!topic.trim()) return;
    setStatus(AppStatus.QUIZ);
    setHistory([]);
    setDifficulty(50);
    setQuestionQueue([]);
    // Fetch initial batch
    fetchQuestionsToQueue(topic, 50, 5, true);
  };

  const handleAnswer = (index: number) => {
    if (feedbackShown) return;
    setSelectedOption(index);
    setFeedbackShown(true);

    if (!currentQuestion) return;

    const isCorrect = index === currentQuestion.correctIndex;
    const newDifficulty = calculateNewDifficulty(difficulty, isCorrect);

    const historyItem: QuizHistoryItem = {
      question: currentQuestion.text,
      userAnswerIndex: index,
      correctIndex: currentQuestion.correctIndex,
      isCorrect,
      timestamp: Date.now(),
      difficultyBefore: difficulty,
      difficultyAfter: newDifficulty
    };

    setHistory(prev => [...prev, historyItem]);
    setDifficulty(newDifficulty);

    // Trigger background prefetch aggressively
    // Threshold increased to <= 4 to prevent running dry
    // Batch size increased to 5
    if (questionQueue.length <= 4 && !prefetchingRef.current) {
      fetchQuestionsToQueue(topic, newDifficulty, 5, false);
    }
  };

  const handleNext = () => {
    setFeedbackShown(false);
    setSelectedOption(null);

    if (questionQueue.length > 0) {
      // Instant transition
      const nextQ = questionQueue[0];
      setCurrentQuestion(nextQ);
      setQuestionQueue(prev => prev.slice(1));
    } else {
      // Edge case: Queue is empty (user answered too fast or API error)
      // This sets the UI to blocking load mode
      setIsLoadingInitial(true);
      // Try to fetch, but if a background fetch is already running, 
      // fetchQuestionsToQueue will return early.
      // The useEffect above will handle the state update when data arrives.
      fetchQuestionsToQueue(topic, difficulty, 5, true);
    }
  };

  const resetApp = () => {
    setStatus(AppStatus.IDLE);
    setTopic('');
    setHistory([]);
    setDifficulty(50);
    setCurrentQuestion(null);
    setQuestionQueue([]);
  };

  // --- Render Helpers ---

  const renderSetup = () => (
    <div className="flex flex-col items-center justify-center min-h-[60vh] max-w-md mx-auto px-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full border border-slate-100">
        <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mb-6 mx-auto">
          <Brain className="w-8 h-8 text-indigo-600" />
        </div>
        <h1 className="text-3xl font-bold text-slate-800 text-center mb-2">SmartPath AI 智能导师</h1>
        <p className="text-slate-500 text-center mb-8">
          输入您想要掌握的主题。AI 将预加载个性化题目，为您提供流畅的学习体验。
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">主题 / 学科</label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="例如：Python, 世界历史, 微积分"
              className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
              onKeyDown={(e) => e.key === 'Enter' && startQuiz()}
            />
          </div>
          <Button 
            onClick={startQuiz} 
            disabled={!topic.trim()} 
            className="w-full justify-center py-3 text-lg"
          >
            开始学习 <ArrowRight className="w-5 h-5 ml-1" />
          </Button>
        </div>
      </div>
      
      {!process.env.API_KEY && (
        <div className="mt-6 p-4 bg-red-50 text-red-700 rounded-lg text-sm border border-red-200 text-center">
          等等！您需要在环境变量中设置 API_KEY 才能正常工作。
        </div>
      )}
    </div>
  );

  const renderQuiz = () => (
    <div className="max-w-5xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-500">
      
      {/* Left Column: Stats & Progress */}
      <div className="lg:col-span-1 space-y-6">
        {/* User Level Card */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden">
          <div className="flex items-center justify-between mb-4 relative z-10">
            <h2 className="font-semibold text-slate-700 flex items-center gap-2">
              <Activity className="w-5 h-5 text-indigo-500" /> 熟练度
            </h2>
            <span className="text-2xl font-bold text-indigo-600">{difficulty}</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2.5 mb-2 overflow-hidden relative z-10">
            <div 
              className="bg-indigo-600 h-2.5 rounded-full transition-all duration-1000 ease-out" 
              style={{ width: `${difficulty}%` }}
            ></div>
          </div>
          <div className="flex justify-between items-center text-xs text-slate-400 relative z-10">
             <span>自适应等级 (0-100)</span>
             {isPrefetching && (
               <span className="flex items-center text-indigo-400 animate-pulse">
                 <Zap className="w-3 h-3 mr-1" /> AI 生成中...
               </span>
             )}
          </div>
        </div>

        {/* Chart */}
        <ProficiencyChart history={history} currentDifficulty={difficulty} />

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100">
            <p className="text-xs text-emerald-600 font-medium uppercase">正确</p>
            <p className="text-2xl font-bold text-emerald-700">
              {history.filter(h => h.isCorrect).length}
            </p>
          </div>
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <p className="text-xs text-slate-500 font-medium uppercase">已答题数</p>
            <p className="text-2xl font-bold text-slate-700">{history.length}</p>
          </div>
        </div>

        <Button variant="ghost" onClick={resetApp} className="w-full justify-center">
          <RotateCcw className="w-4 h-4 mr-2" /> 更换主题
        </Button>
      </div>

      {/* Right Column: Question Area */}
      <div className="lg:col-span-2">
        <div className="bg-white p-6 md:p-8 rounded-2xl shadow-md border border-slate-100 min-h-[500px] flex flex-col">
          
          <div className="mb-6 flex justify-between items-center">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">
              {topic}
            </span>
            {currentQuestion?.topicSubCategory && (
              <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">
                {currentQuestion.topicSubCategory}
              </span>
            )}
          </div>

          {isLoadingInitial ? (
             <div className="flex-1 flex flex-col items-center justify-center space-y-4 animate-pulse">
                <div className="h-4 bg-slate-200 rounded w-3/4"></div>
                <div className="h-4 bg-slate-200 rounded w-1/2"></div>
                <div className="h-32 w-full bg-slate-100 rounded-lg mt-8"></div>
                <div className="text-slate-400 text-sm font-medium">
                  AI 正在根据您的水平准备题目...
                  <br/>
                  <span className="text-xs text-slate-300 block text-center mt-2">预加载中...</span>
                </div>
             </div>
          ) : currentQuestion ? (
            <div className="flex-1 flex flex-col">
              <h3 className="text-xl md:text-2xl font-bold text-slate-800 leading-relaxed mb-8 animate-in fade-in duration-300">
                {currentQuestion.text}
              </h3>

              <div className="space-y-3 mb-8">
                {currentQuestion.options.map((option, idx) => {
                  let btnClass = "w-full text-left p-4 rounded-xl border-2 transition-all duration-200 flex items-center justify-between group ";
                  
                  if (feedbackShown) {
                    if (idx === currentQuestion.correctIndex) {
                      btnClass += "border-emerald-500 bg-emerald-50 text-emerald-800";
                    } else if (idx === selectedOption) {
                      btnClass += "border-red-500 bg-red-50 text-red-800";
                    } else {
                      btnClass += "border-slate-100 text-slate-400 opacity-50";
                    }
                  } else {
                    if (idx === selectedOption) {
                      btnClass += "border-indigo-600 bg-indigo-50 text-indigo-900";
                    } else {
                      btnClass += "border-slate-100 hover:border-indigo-200 hover:bg-slate-50 text-slate-700";
                    }
                  }

                  return (
                    <button
                      key={`${currentQuestion.text}-${idx}`} // Unique key to force re-render on new question
                      onClick={() => handleAnswer(idx)}
                      disabled={feedbackShown}
                      className={btnClass}
                    >
                      <span className="font-medium">{option}</span>
                      {feedbackShown && idx === currentQuestion.correctIndex && (
                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                      )}
                      {feedbackShown && idx === selectedOption && idx !== currentQuestion.correctIndex && (
                        <XCircle className="w-5 h-5 text-red-500" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Feedback Section */}
              {feedbackShown && (
                <div className="mt-auto animate-in slide-in-from-bottom-2 fade-in duration-300">
                  <div className={`p-4 rounded-xl border mb-4 ${
                    selectedOption === currentQuestion.correctIndex 
                    ? 'bg-emerald-50 border-emerald-100' 
                    : 'bg-indigo-50 border-indigo-100'
                  }`}>
                    <h4 className="font-semibold mb-1 text-sm uppercase tracking-wide opacity-70">
                      {selectedOption === currentQuestion.correctIndex ? '太棒了！' : '解析'}
                    </h4>
                    <p className="text-slate-800 leading-relaxed">
                      {currentQuestion.explanation}
                    </p>
                  </div>
                  <Button onClick={handleNext} className="w-full justify-center py-4 text-lg shadow-lg">
                    下一题 <ChevronRight className="w-5 h-5 ml-1" />
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12">
               <p className="text-slate-500">无法加载题目。</p>
               <Button onClick={() => fetchQuestionsToQueue(topic, difficulty, 5, true)} variant="outline" className="mt-4">重试</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      {/* Header */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-10 backdrop-blur-sm bg-white/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-2">
              <div className="bg-indigo-600 p-1.5 rounded-lg">
                 <Trophy className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold text-slate-800 tracking-tight">SmartPath<span className="text-indigo-600">AI</span></span>
            </div>
            {status === AppStatus.QUIZ && (
              <div className="text-sm font-medium text-slate-500 hidden sm:block">
                正在学习： <span className="text-slate-800">{topic}</span>
              </div>
            )}
          </div>
        </div>
      </nav>

      <main className="pt-8">
        {status === AppStatus.IDLE && renderSetup()}
        {status === AppStatus.QUIZ && renderQuiz()}
      </main>
    </div>
  );
};

export default App;