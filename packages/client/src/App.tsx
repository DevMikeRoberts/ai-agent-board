import { useState, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import type { Task } from '@/types';
import { useTheme } from '@/hooks/useTheme';
import { useTasks } from '@/hooks/useTasks';
import { Header } from '@/components/Header';
import { Board } from '@/components/Board';
import { TaskDialog } from '@/components/TaskDialog';
import { AgentPanel } from '@/components/AgentPanel';

export function App() {
  const { theme, toggleTheme } = useTheme();
  const { tasks, addTask, moveTask, runTask, stopTask, getTasksByColumn } = useTasks();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const handleTaskClick = useCallback((task: Task) => {
    setSelectedTask(task);
  }, []);

  const handleClosePanel = useCallback(() => {
    setSelectedTask(null);
  }, []);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Header
        theme={theme}
        toggleTheme={toggleTheme}
        taskCount={tasks.length}
      />

      <main className="flex-1 overflow-hidden">
        <Board
          tasks={tasks}
          getTasksByColumn={getTasksByColumn}
          onMoveTask={moveTask}
          onTaskClick={handleTaskClick}
          onAddTask={() => setDialogOpen(true)}
        />
      </main>

      <TaskDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSubmit={addTask}
      />

      <AgentPanel task={selectedTask} onClose={handleClosePanel} onRun={runTask} onStop={stopTask} />
    </div>
  );
}
