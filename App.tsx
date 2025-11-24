import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Brain, Trophy, ChevronRight, CheckCircle2, XCircle, BarChart3, RotateCcw, ArrowRight, Activity, Zap, Calendar, CheckSquare, Flame, BookOpen, X, PlayCircle, FileText, Search, Sparkles, Target, Lock, Check, Lightbulb, MessageCircleQuestion } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { generateAdaptiveQuestions, generateStudyPlan, generateStudyMaterial, explainConcept } from './services/geminiService';
import { AppStatus, Question, QuizHistoryItem, StudyPlanDay, StudyMaterialContent } from './types';
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
  
  // Auxiliary Features State
  const [streak, setStreak] = useState(0);
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [studyPlan, setStudyPlan] = useState<StudyPlanDay[]>([]);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [activePlanDay, setActivePlanDay] = useState<number | null>(null); // Track which day is currently being worked on
  
  // Study Material State
  const [studyMaterial, setStudyMaterial] = useState<StudyMaterialContent | null>(null);
  const [activeMaterialContext, setActiveMaterialContext] = useState<string | null>(null); // Store content for context-aware quizzes
  const [isLoadingMaterial, setIsLoadingMaterial] = useState(false);
  const [currentDayFocus, setCurrentDayFocus] = useState<{subTopic: string, focus: string} | null>(null);

  // Text Selection & Interactive Explanation State
  const [selectionPopup, setSelectionPopup] = useState<{ x: number, y: number, text: string } | null>(null);
  const [explanationData, setExplanationData] = useState<{ text: string, content: string | null, loading: boolean } | null>(null);
  const materialContainerRef = useRef<HTMLDivElement>(null);

  // To prevent double firing in React Strict Mode
  const prefetchingRef = useRef(false);

  // --- Logic ---

  // Initialize Streak from LocalStorage
  useEffect(() => {
    const today = new Date().toDateString();
    const lastCheckIn = localStorage.getItem('lastCheckInDate');
    const storedStreak = parseInt(localStorage.getItem('streakCount') || '0', 10);

    if (lastCheckIn === today) {
      setIsCheckedIn(true);
      setStreak(storedStreak);
    } else {
      // Check if streak is broken (i.e., last check-in was before yesterday)
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      if (lastCheckIn === yesterday.toDateString()) {
        // Streak continues, but not checked in today yet
        setStreak(storedStreak);
      } else {
        // Streak broken or first time
        setStreak(lastCheckIn ? 0 : 0); 
      }
      setIsCheckedIn(false);
    }
  }, []);

  const handleCheckIn = () => {
    if (isCheckedIn) return;
    
    const newStreak = streak + 1;
    setStreak(newStreak);
    setIsCheckedIn(true);
    
    const today = new Date().toDateString();
    localStorage.setItem('lastCheckInDate', today);
    localStorage.setItem('streakCount', newStreak.toString());
  };

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

  const fetchQuestionsToQueue = useCallback(async (
    currentTopic: string, 
    currentDiff: number, 
    count: number,
    isInitialLoad: boolean = false,
    sourceMaterial?: string
  ) => {
    if (prefetchingRef.current) return;
    
    prefetchingRef.current = true;
    
    if (isInitialLoad) setIsLoadingInitial(true);
    else setIsPrefetching(true);

    try {
      const previousSubTopics = history.slice(-5).map(h => h.question);
      const newQuestions = await generateAdaptiveQuestions(currentTopic, currentDiff, previousSubTopics, count, sourceMaterial);
      
      setQuestionQueue(prev => [...prev, ...newQuestions]);
      
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

  useEffect(() => {
    if (isLoadingInitial && questionQueue.length > 0) {
      const nextQ = questionQueue[0];
      setCurrentQuestion(nextQ);
      setQuestionQueue(prev => prev.slice(1));
      setIsLoadingInitial(false);
    }
  }, [questionQueue, isLoadingInitial]);

  // Global click listener to close selection popup if clicked outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (selectionPopup && !(e.target as HTMLElement).closest('.selection-popup-btn')) {
        setSelectionPopup(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [selectionPopup]);

  const startQuiz = (customTopic?: string, sourceMaterial?: string) => {
    const finalTopic = customTopic || topic;
    if (!finalTopic.trim()) return;
    
    // Auto check-in when starting a quiz if not done
    if (!isCheckedIn) handleCheckIn();

    setStatus(AppStatus.QUIZ);
    // Only reset history if we are NOT in a continuous plan session (or if starting fresh)
    setHistory([]); 
    setQuestionQueue([]);
    // If sourceMaterial is provided (context mode), use it.
    fetchQuestionsToQueue(finalTopic, difficulty, 5, true, sourceMaterial);
  };

  const handleCreatePlan = async () => {
    if (!topic.trim()) return;
    setIsGeneratingPlan(true);
    setShowPlanModal(true);
    try {
      const rawPlan = await generateStudyPlan(topic, difficulty);
      // Process plan to add status
      const processedPlan: StudyPlanDay[] = rawPlan.map((day, index) => ({
        ...day,
        status: index === 0 ? 'current' : 'locked'
      }));
      setStudyPlan(processedPlan);
    } catch (error) {
      console.error(error);
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  const handleStartPlanDay = async (day: StudyPlanDay) => {
    if (day.status === 'locked') return;

    setActivePlanDay(day.day);
    setShowPlanModal(false);
    setIsLoadingMaterial(true);
    setStatus(AppStatus.MATERIAL_VIEW); 
    setStudyMaterial(null);
    setActiveMaterialContext(null);
    setSelectionPopup(null);
    setExplanationData(null);
    
    const combinedTopic = `${topic}: ${day.topic}`;
    setCurrentDayFocus({ subTopic: day.topic, focus: day.focus });

    try {
      const material = await generateStudyMaterial(topic, day.topic, day.focus, difficulty);
      setStudyMaterial(material);
      // Store the material content so the subsequent quiz can test understanding of THIS material
      setActiveMaterialContext(material.markdown);
    } catch (e) {
      setStudyMaterial({
        markdown: "加载学习材料失败。请直接尝试答题。"
      });
    } finally {
      setIsLoadingMaterial(false);
    }
  };

  const handleCompletePlanDay = () => {
    if (activePlanDay === null) {
      resetApp();
      return;
    }

    // Update the plan: Mark current as completed, unlock next
    const updatedPlan = studyPlan.map(day => {
      if (day.day === activePlanDay) {
        return { ...day, status: 'completed' } as StudyPlanDay;
      }
      if (day.day === activePlanDay + 1) {
        return { ...day, status: 'current' } as StudyPlanDay;
      }
      return day;
    });

    setStudyPlan(updatedPlan);
    setActivePlanDay(null);
    setStatus(AppStatus.IDLE);
    setHistory([]);
    setCurrentQuestion(null);
    setActiveMaterialContext(null);
    setShowPlanModal(true); // Re-open modal to show progress
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

    if (questionQueue.length <= 4 && !prefetchingRef.current) {
      // Use currentDayFocus if available for more specific next questions
      const queryTopic = currentDayFocus ? `${topic}: ${currentDayFocus.subTopic}` : topic;
      // Pass activeMaterialContext to ensure continuous questions stay relevant to the material
      fetchQuestionsToQueue(queryTopic, newDifficulty, 5, false, activeMaterialContext || undefined);
    }
  };

  const handleNext = () => {
    setFeedbackShown(false);
    setSelectedOption(null);

    if (questionQueue.length > 0) {
      const nextQ = questionQueue[0];
      setCurrentQuestion(nextQ);
      setQuestionQueue(prev => prev.slice(1));
    } else {
      setIsLoadingInitial(true);
      const queryTopic = currentDayFocus ? `${topic}: ${currentDayFocus.subTopic}` : topic;
      fetchQuestionsToQueue(queryTopic, difficulty, 5, true, activeMaterialContext || undefined);
    }
  };

  const resetApp = () => {
    setStatus(AppStatus.IDLE);
    setTopic('');
    setHistory([]);
    setDifficulty(50);
    setCurrentQuestion(null);
    setQuestionQueue([]);
    setStudyMaterial(null);
    setActiveMaterialContext(null);
    setCurrentDayFocus(null);
    setStudyPlan([]); // Clear plan on full reset
    setActivePlanDay(null);
    setSelectionPopup(null);
    setExplanationData(null);
  };

  // --- Selection Interaction ---

  const handleTextSelection = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      // Don't close immediately if clicking inside the button, handled by global listener
      return;
    }

    const text = selection.toString().trim();
    if (!text || text.length > 200) return; // Ignore very long selections

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    // Adjust for scroll offset if needed, but 'fixed' position works best for popups relative to viewport
    // Calculate center top position
    setSelectionPopup({
      x: rect.left + rect.width / 2,
      y: rect.top - 10, // Slightly above
      text: text
    });
  }, []);

  const handleExplain = async () => {
    if (!selectionPopup) return;
    
    const textToExplain = selectionPopup.text;
    const context = currentDayFocus ? currentDayFocus.subTopic : topic;
    
    setSelectionPopup(null);
    setExplanationData({ text: textToExplain, content: null, loading: true });
    
    try {
      const explanation = await explainConcept(textToExplain, context);
      setExplanationData({ text: textToExplain, content: explanation, loading: false });
    } catch (e) {
      setExplanationData({ text: textToExplain, content: "解释失败，请重试。", loading: false });
    }
  };

  // --- Render Helpers ---

  const renderDashboard = () => (
    <div className="max-w-4xl mx-auto px-4 py-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Hero Section */}
      <div className="text-center mb-10">
         <h1 className="text-4xl font-extrabold text-slate-800 mb-4 tracking-tight">
           今天想掌握什么新技能？
         </h1>
         <p className="text-slate-500 text-lg">
           AI 驱动的自适应学习平台，为您量身定制学习路径。
         </p>
      </div>

      {/* Main Input Area */}
      <div className="max-w-2xl mx-auto relative mb-12 group">
        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
          <Search className="h-6 w-6 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
        </div>
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="输入学习主题 (例如: Python, 摄影构图, 微积分...)"
          className="w-full pl-14 pr-6 py-5 text-lg rounded-2xl border-2 border-slate-200 shadow-sm focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-300"
          onKeyDown={(e) => e.key === 'Enter' && startQuiz()}
          autoFocus
        />
      </div>

      {/* Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
        
        {/* Quick Quiz Card */}
        <button 
          onClick={() => startQuiz()}
          disabled={!topic.trim()}
          className={`
            relative p-6 rounded-2xl border-2 text-left transition-all duration-300 group
            ${!topic.trim() 
              ? 'border-slate-100 bg-white opacity-60 cursor-not-allowed' 
              : 'border-indigo-100 bg-white hover:border-indigo-500 hover:shadow-xl hover:shadow-indigo-100 cursor-pointer'
            }
          `}
        >
          <div className={`
            w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-colors
            ${!topic.trim() ? 'bg-slate-100 text-slate-400' : 'bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white'}
          `}>
            <Zap className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-bold text-slate-800 mb-2">快速测验</h3>
          <p className="text-slate-500 text-sm">直接开始做题，AI 将根据您的表现实时调整难度。</p>
          {topic.trim() && (
             <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity text-indigo-500">
               <ArrowRight className="w-5 h-5" />
             </div>
          )}
        </button>

        {/* Study Plan Card */}
        <button 
          onClick={handleCreatePlan}
          disabled={!topic.trim()}
          className={`
            relative p-6 rounded-2xl border-2 text-left transition-all duration-300 group
            ${!topic.trim() 
              ? 'border-slate-100 bg-white opacity-60 cursor-not-allowed' 
              : 'border-emerald-100 bg-white hover:border-emerald-500 hover:shadow-xl hover:shadow-emerald-100 cursor-pointer'
            }
          `}
        >
          <div className={`
            w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-colors
            ${!topic.trim() ? 'bg-slate-100 text-slate-400' : 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white'}
          `}>
            <Calendar className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-bold text-slate-800 mb-2">生成学习计划</h3>
          <p className="text-slate-500 text-sm">不知道从何学起？生成 5 天结构化学习路径。</p>
          {topic.trim() && (
             <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity text-emerald-500">
               <Sparkles className="w-5 h-5" />
             </div>
          )}
        </button>

      </div>

      {/* Streak / Daily Check-in Area */}
      <div className="max-w-3xl mx-auto mt-12 flex justify-center">
         <div className="bg-orange-50/50 border border-orange-100 rounded-full px-6 py-2 flex items-center gap-4 hover:bg-orange-50 transition-colors">
            <div className="flex items-center gap-2">
              <Flame className={`w-5 h-5 ${isCheckedIn ? 'text-orange-500 fill-orange-500' : 'text-slate-300'}`} />
              <span className="text-sm font-semibold text-slate-700">连续学习: <span className="text-orange-600 text-lg">{streak}</span> 天</span>
            </div>
            <div className="h-4 w-px bg-orange-200"></div>
            {isCheckedIn ? (
               <span className="text-xs font-medium text-orange-600 flex items-center">
                 <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> 今日已打卡
               </span>
            ) : (
               <button onClick={handleCheckIn} className="text-xs font-bold text-orange-600 hover:text-orange-700 underline decoration-2 underline-offset-2">
                 立即打卡
               </button>
            )}
         </div>
      </div>

      {!process.env.API_KEY && (
        <div className="mt-8 p-4 bg-red-50 text-red-700 rounded-lg text-sm border border-red-200 text-center max-w-2xl mx-auto">
          ⚠️ 需要配置 API_KEY 环境变量才能连接 AI 导师。
        </div>
      )}
    </div>
  );

  const renderStudyMaterial = () => (
    <div className="max-w-4xl mx-auto px-4 py-8 animate-in fade-in duration-500">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-visible relative">
        {/* Header */}
        <div className="bg-indigo-50 border-b border-indigo-100 p-6 md:p-8 rounded-t-2xl">
           <div className="flex items-center gap-2 text-indigo-600 font-bold uppercase tracking-wider text-xs mb-2">
             <FileText className="w-4 h-4" /> 今日学习材料
           </div>
           <h1 className="text-2xl md:text-3xl font-bold text-slate-800">
             {currentDayFocus?.subTopic || topic}
           </h1>
           {currentDayFocus && (
             <p className="text-slate-600 mt-2">
               重点关注: <span className="font-medium text-indigo-700">{currentDayFocus.focus}</span>
             </p>
           )}
        </div>

        {/* Content */}
        <div 
          className="p-6 md:p-12 min-h-[400px]" 
          onMouseUp={handleTextSelection}
          ref={materialContainerRef}
        >
           {isLoadingMaterial || !studyMaterial ? (
             <div className="flex flex-col items-center justify-center py-20 space-y-6">
                <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                <div className="text-center">
                  <p className="text-lg font-medium text-slate-700">AI 导师正在为您定制权威讲义...</p>
                  <p className="text-slate-500 text-sm mt-1">检索学术概念并通俗化解读中</p>
                </div>
             </div>
           ) : (
             <div className="max-w-none">
                {/* Markdown Content */}
                <div className="prose prose-slate prose-lg mx-auto">
                  <ReactMarkdown>{studyMaterial.markdown}</ReactMarkdown>
                </div>
                
                <div className="mt-8 pt-8 border-t border-slate-100 text-center text-sm text-slate-400">
                   💡 提示：选中任意不懂的文字，AI 即可为您详细解释
                </div>
             </div>
           )}
        </div>

        {/* Floating AI Button */}
        {selectionPopup && (
          <div 
            className="fixed z-50 transform -translate-x-1/2 -translate-y-full selection-popup-btn"
            style={{ left: selectionPopup.x, top: selectionPopup.y }}
          >
             <button 
               onClick={handleExplain}
               className="bg-indigo-600 text-white px-4 py-2 rounded-full shadow-lg hover:bg-indigo-700 transition-transform hover:scale-105 active:scale-95 flex items-center gap-2 text-sm font-semibold animate-in zoom-in duration-200"
             >
               <Sparkles className="w-4 h-4" /> AI 讲解
             </button>
             {/* Little triangle pointer */}
             <div className="w-3 h-3 bg-indigo-600 transform rotate-45 absolute left-1/2 -translate-x-1/2 -bottom-1.5 -z-10"></div>
          </div>
        )}

        {/* Explanation Modal/Card */}
        {explanationData && (
          <div className="fixed inset-0 bg-black/20 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
             <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-100">
                <div className="bg-indigo-600 p-4 flex justify-between items-center text-white">
                   <h3 className="font-bold flex items-center gap-2">
                     <Lightbulb className="w-5 h-5 text-yellow-300" /> AI 概念解析
                   </h3>
                   <button onClick={() => setExplanationData(null)} className="hover:bg-indigo-700 p-1 rounded-full transition-colors">
                     <X className="w-5 h-5" />
                   </button>
                </div>
                <div className="p-6">
                   <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">您选中的内容</div>
                   <div className="bg-slate-50 p-3 rounded-lg border-l-4 border-indigo-400 text-slate-700 italic mb-6">
                     "{explanationData.text}"
                   </div>
                   
                   <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">解析</div>
                   {explanationData.loading ? (
                     <div className="space-y-3">
                        <div className="h-4 bg-slate-100 rounded animate-pulse w-full"></div>
                        <div className="h-4 bg-slate-100 rounded animate-pulse w-5/6"></div>
                        <div className="h-4 bg-slate-100 rounded animate-pulse w-4/6"></div>
                     </div>
                   ) : (
                     <div className="prose prose-sm prose-slate max-w-none text-slate-700 leading-relaxed">
                        <ReactMarkdown>{explanationData.content || ''}</ReactMarkdown>
                     </div>
                   )}
                </div>
                <div className="bg-slate-50 p-4 text-center">
                   <Button size="sm" variant="outline" onClick={() => setExplanationData(null)}>明白了</Button>
                </div>
             </div>
          </div>
        )}

        {/* Footer Action */}
        {!isLoadingMaterial && (
          <div className="bg-slate-50 p-6 border-t border-slate-100 flex justify-between items-center rounded-b-2xl">
             <Button variant="ghost" onClick={resetApp}>放弃学习</Button>
             <div className="flex items-center gap-4">
                <span className="text-sm text-slate-500 hidden md:inline">理解了吗？开始巩固练习</span>
                <Button 
                  onClick={() => startQuiz(currentDayFocus ? `${topic}: ${currentDayFocus.subTopic}` : topic, studyMaterial?.markdown)} 
                  className="shadow-lg shadow-indigo-200"
                >
                  开始实战演练 <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
             </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderQuiz = () => (
    <div className="max-w-6xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in duration-500">
      
      {/* Left Column: Stats & Progress */}
      <div className="lg:col-span-4 space-y-6">
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
                 <Zap className="w-3 h-3 mr-1" /> 准备下一题...
               </span>
             )}
          </div>
        </div>

        {/* Chart */}
        <ProficiencyChart history={history} currentDifficulty={difficulty} />

        {/* Stats Grid */}
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

        <Button variant="ghost" onClick={activePlanDay ? handleCompletePlanDay : resetApp} className="w-full justify-center text-slate-500 hover:text-slate-700">
          <RotateCcw className="w-4 h-4 mr-2" /> {activePlanDay ? "放弃并返回计划" : "结束并返回"}
        </Button>
      </div>

      {/* Right Column: Question Area */}
      <div className="lg:col-span-8">
        <div className="bg-white p-6 md:p-10 rounded-2xl shadow-md border border-slate-100 min-h-[500px] flex flex-col relative">
          
          <div className="mb-8 flex justify-between items-start">
            <div>
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 mb-2">
                {currentDayFocus ? `Day ${activePlanDay}: ${currentDayFocus.subTopic}` : topic}
              </span>
              {currentQuestion?.topicSubCategory && (
                <div className="text-sm text-slate-400 font-medium uppercase tracking-wider flex items-center gap-1">
                  <BookOpen className="w-3 h-3" /> {currentQuestion.topicSubCategory}
                </div>
              )}
            </div>
            <div className="text-slate-300 text-sm font-mono">Q{history.length + 1}</div>
          </div>

          {isLoadingInitial ? (
             <div className="flex-1 flex flex-col items-center justify-center space-y-6 animate-pulse">
                <div className="h-4 bg-slate-200 rounded w-3/4"></div>
                <div className="h-4 bg-slate-200 rounded w-1/2"></div>
                <div className="h-48 w-full bg-slate-50 rounded-xl mt-8"></div>
                <div className="text-slate-400 text-sm font-medium text-center">
                  AI 正在根据您的表现<br/>生成量身定制的题目...
                </div>
             </div>
          ) : currentQuestion ? (
            <div className="flex-1 flex flex-col">
              <h3 className="text-xl md:text-2xl font-bold text-slate-800 leading-relaxed mb-8 animate-in fade-in duration-300">
                {currentQuestion.text}
              </h3>

              <div className="space-y-3 mb-8">
                {currentQuestion.options.map((option, idx) => {
                  let btnClass = "w-full text-left p-4 rounded-xl border-2 transition-all duration-200 flex items-center justify-between group relative overflow-hidden ";
                  
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
                      btnClass += "border-slate-100 hover:border-indigo-300 hover:bg-slate-50 text-slate-700";
                    }
                  }

                  return (
                    <button
                      key={`${currentQuestion.text}-${idx}`} 
                      onClick={() => handleAnswer(idx)}
                      disabled={feedbackShown}
                      className={btnClass}
                    >
                      <span className="font-medium relative z-10">{option}</span>
                      {feedbackShown && idx === currentQuestion.correctIndex && (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 relative z-10" />
                      )}
                      {feedbackShown && idx === selectedOption && idx !== currentQuestion.correctIndex && (
                        <XCircle className="w-5 h-5 text-red-500 relative z-10" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Feedback Section */}
              {feedbackShown && (
                <div className="mt-auto animate-in slide-in-from-bottom-4 fade-in duration-500">
                  <div className={`p-5 rounded-xl border mb-6 shadow-sm ${
                    selectedOption === currentQuestion.correctIndex 
                    ? 'bg-emerald-50 border-emerald-100' 
                    : 'bg-indigo-50 border-indigo-100'
                  }`}>
                    <h4 className="font-bold mb-2 text-sm uppercase tracking-wide opacity-80 flex items-center gap-2">
                      {selectedOption === currentQuestion.correctIndex ? (
                        <><CheckCircle2 className="w-4 h-4"/> 回答正确</>
                      ) : (
                        <><Brain className="w-4 h-4"/> 知识点解析</>
                      )}
                    </h4>
                    <p className="text-slate-800 leading-relaxed text-base">
                      {currentQuestion.explanation}
                    </p>
                  </div>
                  <div className="flex gap-4">
                    <Button onClick={handleNext} className="flex-1 justify-center py-4 text-lg shadow-lg shadow-indigo-200">
                      下一题 <ChevronRight className="w-5 h-5 ml-1" />
                    </Button>
                    {activePlanDay && history.length >= 3 && (
                      <Button onClick={handleCompletePlanDay} variant="secondary" className="px-6 py-4 shadow-lg shadow-emerald-200">
                         完成今日打卡
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12">
               <p className="text-slate-500">无法加载题目。</p>
               <Button onClick={() => fetchQuestionsToQueue(topic, difficulty, 5, true, activeMaterialContext || undefined)} variant="outline" className="mt-4">重试</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderPlanModal = () => (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col animate-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 rounded-t-2xl">
          <div>
            <h2 className="text-xl font-bold text-slate-800">学习计划: {topic}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-700">Level {difficulty}</span>
              <span className="text-xs text-slate-400">
                 完成进度: {studyPlan.filter(d => d.status === 'completed').length} / {studyPlan.length}
              </span>
            </div>
          </div>
          <button onClick={() => setShowPlanModal(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100">
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto custom-scrollbar">
          {isGeneratingPlan ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
              <p className="text-slate-500">AI 正在为您规划最佳学习路径...</p>
            </div>
          ) : studyPlan.length > 0 ? (
            <div className="relative pl-6 space-y-8 before:absolute before:left-[22px] before:top-4 before:bottom-4 before:w-0.5 before:bg-slate-200">
              {studyPlan.map((day, index) => {
                const isLocked = day.status === 'locked';
                const isCompleted = day.status === 'completed';
                const isCurrent = day.status === 'current';

                return (
                  <div key={day.day} className={`relative transition-all duration-300 ${isLocked ? 'opacity-60 grayscale' : 'opacity-100'}`}>
                    {/* Timeline Dot */}
                    <div className={`
                      absolute -left-[35px] w-8 h-8 rounded-full flex items-center justify-center border-4 z-10 transition-colors duration-300
                      ${isCompleted ? 'bg-emerald-500 border-emerald-100 text-white' : 
                        isCurrent ? 'bg-indigo-600 border-indigo-100 text-white' : 
                        'bg-white border-slate-200 text-slate-400'}
                    `}>
                      {isCompleted ? <Check className="w-4 h-4" /> : 
                       isLocked ? <Lock className="w-3 h-3" /> :
                       <span className="text-xs font-bold">{day.day}</span>}
                    </div>

                    {/* Content Card */}
                    <div className={`
                      rounded-xl border p-5 transition-all duration-300
                      ${isCurrent ? 'bg-white border-indigo-200 shadow-lg shadow-indigo-50 scale-[1.02]' : 
                        isCompleted ? 'bg-emerald-50/30 border-emerald-100' : 'bg-slate-50 border-slate-100'}
                    `}>
                      <div className="flex justify-between items-start mb-2">
                         <div>
                            <h3 className={`font-bold text-lg ${isCompleted ? 'text-emerald-900' : 'text-slate-800'}`}>
                              {day.topic}
                            </h3>
                            <p className="text-sm text-slate-500">{day.focus}</p>
                         </div>
                         {isCurrent && (
                           <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-indigo-100 text-indigo-700 animate-pulse">
                             进行中
                           </span>
                         )}
                         {isCompleted && (
                           <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-emerald-100 text-emerald-700">
                             已完成
                           </span>
                         )}
                      </div>

                      <ul className="space-y-1 mb-4">
                        {day.activities.map((act, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs text-slate-500">
                            <div className="mt-1.5 w-1 h-1 rounded-full bg-slate-400 flex-shrink-0" />
                            <span>{act}</span>
                          </li>
                        ))}
                      </ul>

                      <div className="flex gap-2">
                        <Button 
                          variant={isCurrent ? 'primary' : 'outline'}
                          onClick={() => handleStartPlanDay(day)}
                          disabled={isLocked || isCompleted}
                          className={`
                            w-full sm:w-auto text-sm py-1.5 h-9
                            ${isLocked ? 'cursor-not-allowed' : ''}
                          `}
                        >
                          {isCompleted ? (
                             <>
                               <CheckSquare className="w-4 h-4 mr-1.5" /> 复习
                             </>
                          ) : isLocked ? (
                             <>
                               <Lock className="w-4 h-4 mr-1.5" /> 待解锁
                             </>
                          ) : (
                             <>
                               <PlayCircle className="w-4 h-4 mr-1.5" /> 开始学习
                             </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500">
              无法生成计划，请重试。
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 pb-12 font-sans selection:bg-indigo-100 selection:text-indigo-800">
      {/* Header */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-20 backdrop-blur-sm bg-white/90">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-2 cursor-pointer" onClick={resetApp}>
              <div className="bg-indigo-600 p-1.5 rounded-lg shadow-sm">
                 <Trophy className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold text-slate-800 tracking-tight">SmartPath<span className="text-indigo-600">AI</span></span>
            </div>
            
            <div className="flex items-center gap-4">
               {(status === AppStatus.QUIZ || status === AppStatus.MATERIAL_VIEW) && (
                  <div className="hidden sm:flex items-center px-3 py-1 bg-slate-100 rounded-full text-xs font-medium text-slate-600 max-w-[200px] truncate">
                    {topic}
                  </div>
               )}
               <div className="flex items-center gap-1.5 text-orange-500 font-bold bg-orange-50 px-3 py-1.5 rounded-full border border-orange-100">
                  <Flame className="w-4 h-4 fill-orange-500" />
                  <span className="text-sm">{streak}</span>
               </div>
            </div>
          </div>
        </div>
      </nav>

      <main className="pt-8">
        {status === AppStatus.IDLE && renderDashboard()}
        {status === AppStatus.MATERIAL_VIEW && renderStudyMaterial()}
        {status === AppStatus.QUIZ && renderQuiz()}
      </main>

      {/* Modals */}
      {showPlanModal && renderPlanModal()}
    </div>
  );
};

export default App;
