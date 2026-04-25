// filepath: src/App.tsx
import { useState } from 'react';
import './App.css';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';

// 定义待办事项的类型
interface Todo {
  id: number;
  title: string;
  completed: boolean;
  category: string;
}
// 定义过滤类型
type FilterType = 'all' | 'today' | 'week' | 'completed';

// 主应用组件
function App() {
  // 代办列表
  const [todos, setTodos] = useState<Todo[]>([
    { id: 1, title: '完成项目报告', completed: false, category: 'work' },
    { id: 2, title: '购买生活用品', completed: true, category: 'life' },
    { id: 3, title: '健身锻炼', completed: false, category: 'health' },
  ]);
  // 默认显示全部待办事项
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [newTodoTitle, setNewTodoTitle] = useState('');
  const [isMiniMode, setIsMiniMode] = useState(false);
  // 导航栏-配置(过滤)
  const filters: { key: FilterType; label: string }[] = [
    { key: 'all', label: '全部' },
    { key: 'today', label: '今天' },
    { key: 'week', label: '本周' },
    { key: 'completed', label: '已完成' },
  ];
  // 过滤操作
  const filteredTodos = todos.filter(todo => {
    if (activeFilter === 'completed') return todo.completed;
    if (activeFilter === 'today') return !todo.completed;
    if (activeFilter === 'week') return !todo.completed;
    return true;
  });
  // 添加新待办事项
  const addTodo = () => {
    if (!newTodoTitle.trim()) return;
    const newTodo: Todo = {
      id: Date.now(),
      title: newTodoTitle,
      completed: false,
      category: 'default',
    };
    setTodos([...todos, newTodo]);
    setNewTodoTitle('');
  };
  // 状态切换
  const toggleTodo = (id: number) => {
    setTodos(todos.map(todo => 
      todo.id === id ? { ...todo, completed: !todo.completed } : todo
    ));
  };
  // 删除代办
  const deleteTodo = (id: number) => {
    setTodos(todos.filter(todo => todo.id !== id));
  };
  // ✅ 切换窗口大小（迷你模式 ↔ 正常模式）
  const toggleWindowSize = async () => {
    const win = getCurrentWindow();
    if (isMiniMode) {
      // 退出迷你模式 → 变大
      await win.setSize(new LogicalSize(720, 600));
    } else {
      // 进入迷你模式 → 变小
      await win.setSize(new LogicalSize(350, 500));
    }
  };

  return (
    <div className={`app-container ${isMiniMode ? 'mini-mode' : ''}`}>
      {/* 左侧导航 */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>{isMiniMode ? '' : '待办清单'}</h1>
          <button className="mini-mode-btn" onClick={
                () => {
                  setIsMiniMode(!isMiniMode);
                  toggleWindowSize();
                }
            }>
            {isMiniMode ? '正常' : '迷你'}
          </button>
        </div>
        <nav className="nav-menu">
          {/* 遍历过滤配置生成导航按钮 */}
          {filters.map(filter => (
            <button
              key={filter.key}
              className={`nav-item ${activeFilter === filter.key ? 'active' : ''}`}
              onClick={() => setActiveFilter(filter.key)}
            >
              {filter.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* 右侧内容 */}
      <main className="main-content">
        <div className="content-header">
          <h2>{filters.find(f => f.key === activeFilter)?.label}</h2>
          <span className="count">{filteredTodos.length} 项</span>
        </div>

        <div className="todo-list">
          {filteredTodos.length === 0 ? (
            <div className="empty-state">暂无待办事项</div>
          ) : (
            filteredTodos.map(todo => (
              <div key={todo.id} className={`todo-item ${todo.completed ? 'completed' : ''}`}>
                <input
                  type="checkbox"
                  checked={todo.completed}
                  onChange={() => toggleTodo(todo.id)}
                />
                <span className="todo-title">{todo.title}</span>
                <button className="delete-btn" onClick={() => deleteTodo(todo.id)}>×</button>
              </div>
            ))
          )}
        </div>

        {/* 底部按钮区域 */}
        <div className="bottom-actions">
          <input
            type="text"
            placeholder="添加新待办..."
            value={newTodoTitle}
            onChange={(e) => setNewTodoTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTodo()}
            className="new-todo-input"
          />
          <button className="add-btn" onClick={addTodo}>
            {isMiniMode ? '添加' : '添加代办'}
          </button>
        </div>
      </main>
    </div>
  );
}

export default App;
