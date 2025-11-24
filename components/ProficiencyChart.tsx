import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { QuizHistoryItem } from '../types';

interface ProficiencyChartProps {
  history: QuizHistoryItem[];
  currentDifficulty: number;
}

export const ProficiencyChart: React.FC<ProficiencyChartProps> = ({ history, currentDifficulty }) => {
  // Prepare data: Initial state + history
  const data = [
    { name: '初始', level: 50 }, // Assuming start at 50
    ...history.map((h, i) => ({
      name: `Q${i + 1}`,
      level: h.difficultyAfter,
      isCorrect: h.isCorrect
    }))
  ];

  // Also append current state if not just finished a question
  if (history.length > 0 && history[history.length-1].difficultyAfter !== currentDifficulty) {
     data.push({ name: '当前', level: currentDifficulty, isCorrect: true });
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-slate-200 shadow-lg rounded-lg text-sm">
          <p className="font-bold text-slate-700">{label}</p>
          <p className="text-indigo-600">等级: {Math.round(payload[0].value)}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full h-64 bg-white p-4 rounded-xl shadow-sm border border-slate-100">
      <h3 className="text-sm font-semibold text-slate-500 mb-4 uppercase tracking-wider">学习曲线</h3>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="name" tick={{fontSize: 12, fill: '#64748b'}} axisLine={false} tickLine={false} />
          <YAxis domain={[0, 100]} tick={{fontSize: 12, fill: '#64748b'}} axisLine={false} tickLine={false} />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#6366f1', strokeWidth: 1 }} />
          <ReferenceLine y={currentDifficulty} stroke="#6366f1" strokeDasharray="3 3" />
          <Line 
            type="monotone" 
            dataKey="level" 
            stroke="#4f46e5" 
            strokeWidth={3} 
            dot={{ r: 4, fill: '#4f46e5', strokeWidth: 2, stroke: '#fff' }} 
            activeDot={{ r: 6 }} 
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};