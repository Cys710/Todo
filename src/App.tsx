// filepath: src/App.tsx
import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import './App.css';
import {
  PhysicalPosition,
  PhysicalSize,
  currentMonitor,
  getCurrentWindow,
  LogicalSize,
} from '@tauri-apps/api/window';

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
  ]);
  // 过滤器
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  // 输入框新增待办事项
  const [newTodoTitle, setNewTodoTitle] = useState('');
  // 迷你模式
  const [isMiniMode, setIsMiniMode] = useState(false);
  // 靠边收起
  const [isEdgeCollapsed, setIsEdgeCollapsed] = useState(false);
  const [outerWidth, setOuterWidth] = useState<number | null>(null);

  const isMiniModeRef = useRef(isMiniMode);
  const isEdgeCollapsedRef = useRef(isEdgeCollapsed);
  const lastScaleFactorRef = useRef(1);
  const programmaticMoveUntilRef = useRef(0);
  const lastOuterSizeRef = useRef<PhysicalSize | null>(null);
  const prevBoundsRef = useRef<{
    position: PhysicalPosition;
    size: PhysicalSize;
  } | null>(null);
  const moveTimerRef = useRef<number | null>(null);
  const idleTimerRef = useRef<number | null>(null);

  useEffect(() => {
    isMiniModeRef.current = isMiniMode;
  }, [isMiniMode]);

  useEffect(() => {
    isEdgeCollapsedRef.current = isEdgeCollapsed;
  }, [isEdgeCollapsed]);

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
  // 恢复窗口位置和大小（从靠边收起状态）
  const restoreFromEdge = useCallback(async () => {
    const win = getCurrentWindow();
    programmaticMoveUntilRef.current = Date.now() + 400;

    const prev = prevBoundsRef.current;
    try {
      if (prev) {
        await win.setSize(prev.size);
        await win.setPosition(prev.position);
        prevBoundsRef.current = null;
      }
    } finally {
      setIsEdgeCollapsed(false);
    }
  }, []);

  const getCollapsedWidthPhysical = useCallback(
    () => Math.max(1, Math.round(60 * (lastScaleFactorRef.current || 1))),
    []
  );

  const getTolerancePhysical = useCallback(
    () => Math.round(20 * (lastScaleFactorRef.current || 1)),
    []
  );

  const edgeCollapsedForUi =
    isEdgeCollapsed &&
    (outerWidth === null
      ? true
      : outerWidth <= getCollapsedWidthPhysical() + getTolerancePhysical());

  const collapseToEdge = useCallback(
    async (side: 'left' | 'right') => {
      // 1. 已经贴边了 / 不是迷你模式 → 直接退出
      if (isEdgeCollapsedRef.current) return;
      if (!isMiniModeRef.current) return;
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
      // 2. 获取当前显示器信息（尺寸、缩放比例）
      const monitor = await currentMonitor();
      if (!monitor) return;
      lastScaleFactorRef.current = monitor.scaleFactor || 1;

      // 3. 获取窗口当前位置、大小
      const win = getCurrentWindow();
      const position = await win.outerPosition();
      const size = lastOuterSizeRef.current ?? (await win.outerSize());
      // 4. 保存当前【位置 + 大小】，方便以后恢复
      prevBoundsRef.current = { position, size };

      const collapsedWidthPhysical = getCollapsedWidthPhysical();
      const workAreaLeft = monitor.workArea.position.x;
      const workAreaRight = monitor.workArea.position.x + monitor.workArea.size.width;
      const targetX = side === 'left' ? workAreaLeft : workAreaRight - collapsedWidthPhysical;

      programmaticMoveUntilRef.current = Date.now() + 100;
      await win.setSize(new PhysicalSize(collapsedWidthPhysical, size.height));
      await win.setPosition(new PhysicalPosition(targetX, position.y));

      setIsEdgeCollapsed(true);
    },
    [getCollapsedWidthPhysical]
  );

  const collapseIfNearEdge = useCallback(
    async (positionOverride?: PhysicalPosition) => {
      if (Date.now() < programmaticMoveUntilRef.current) return;
      if (isEdgeCollapsedRef.current) return;
      if (!isMiniModeRef.current) return;

      const monitor = await currentMonitor();
      if (!monitor) return;

      const win = getCurrentWindow();
      const position = positionOverride ?? (await win.outerPosition());
      const size = lastOuterSizeRef.current ?? (await win.outerSize());

      const threshold = 10;
      const workLeft = monitor.workArea.position.x;
      const workRight = monitor.workArea.position.x + monitor.workArea.size.width;

      const leftGap = position.x - workLeft;
      const rightGap = workRight - (position.x + size.width);

      if (leftGap <= threshold) {
        await collapseToEdge('left');
      } else if (rightGap <= threshold) {
        await collapseToEdge('right');
      }
    },
    [collapseToEdge]
  );

  const scheduleIdleRehide = useCallback(() => {
    if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = null;

    if (!isMiniModeRef.current) return;
    if (isEdgeCollapsedRef.current) return;

    idleTimerRef.current = window.setTimeout(() => {
      void collapseIfNearEdge();
    }, 6000);
  }, [collapseIfNearEdge]);

  useEffect(() => {
    const win = getCurrentWindow();

    let unlistenMoved: (() => void) | null = null;
    let unlistenResized: (() => void) | null = null;
    let unlistenFocus: (() => void) | null = null;

    const setup = async () => {
      const initialSize = await win.outerSize();
      lastOuterSizeRef.current = initialSize;
      setOuterWidth(initialSize.width);

      const initialMonitor = await currentMonitor();
      if (initialMonitor) lastScaleFactorRef.current = initialMonitor.scaleFactor || 1;

      unlistenResized = await win.onResized(({ payload: size }) => {
        lastOuterSizeRef.current = size;
        setOuterWidth(size.width);
        if (isEdgeCollapsedRef.current) {
          void (async () => {
            const monitor = await currentMonitor();
            if (monitor) lastScaleFactorRef.current = monitor.scaleFactor || 1;
            const collapsedWidthPhysical = getCollapsedWidthPhysical();
            const tolerance = getTolerancePhysical();
            if (size.width > collapsedWidthPhysical + tolerance) {
              prevBoundsRef.current = null;
              setIsEdgeCollapsed(false);
            }
          })();
        }
        scheduleIdleRehide();
      });

      unlistenMoved = await win.onMoved(({ payload: position }) => {
        if (Date.now() < programmaticMoveUntilRef.current) return;
        if (isEdgeCollapsedRef.current) return;
        if (!isMiniModeRef.current) return;

        if (moveTimerRef.current) window.clearTimeout(moveTimerRef.current);
        moveTimerRef.current = window.setTimeout(() => {
          void (async () => {
            await collapseIfNearEdge(position);
            scheduleIdleRehide();
          })();
        }, 120);
      });

      unlistenFocus = await win.onFocusChanged(({ payload: focused }) => {
        if (focused) {
          scheduleIdleRehide();
          return;
        }
        void collapseIfNearEdge();
      });
    };

    void setup();

    return () => {
      if (moveTimerRef.current) window.clearTimeout(moveTimerRef.current);
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
      unlistenMoved?.();
      unlistenResized?.();
      unlistenFocus?.();
    };
  }, [collapseIfNearEdge, scheduleIdleRehide]);

  useEffect(() => {
    if (!isMiniMode && isEdgeCollapsed) {
      void restoreFromEdge();
    }
  }, [isMiniMode, isEdgeCollapsed, restoreFromEdge]);

  useEffect(() => {
    if (!isEdgeCollapsed) return;

    const win = getCurrentWindow();
    const intervalId = window.setInterval(() => {
      void (async () => {
        const size = await win.outerSize();
        lastOuterSizeRef.current = size;
        setOuterWidth(size.width);

        const monitor = await currentMonitor();
        if (monitor) lastScaleFactorRef.current = monitor.scaleFactor || 1;

        const collapsedWidthPhysical = getCollapsedWidthPhysical();
        const tolerance = getTolerancePhysical();
        if (size.width > collapsedWidthPhysical + tolerance) {
          prevBoundsRef.current = null;
          setIsEdgeCollapsed(false);
        }
      })();
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [isEdgeCollapsed, getCollapsedWidthPhysical, getTolerancePhysical]);

  useEffect(() => {
    if (isMiniMode && !isEdgeCollapsed) {
      scheduleIdleRehide();
      return;
    }
    if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = null;
  }, [isMiniMode, isEdgeCollapsed, scheduleIdleRehide]);

  useEffect(() => {
    const onInteract = () => scheduleIdleRehide();
    window.addEventListener('pointerdown', onInteract, { passive: true });
    window.addEventListener('keydown', onInteract);
    return () => {
      window.removeEventListener('pointerdown', onInteract);
      window.removeEventListener('keydown', onInteract);
    };
  }, [scheduleIdleRehide]);

  const onSidebarPointerDownCapture = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      if (!edgeCollapsedForUi) return;
      e.preventDefault();
      e.stopPropagation();
      void restoreFromEdge().finally(() => scheduleIdleRehide());
    },
    [edgeCollapsedForUi, restoreFromEdge, scheduleIdleRehide]
  );
  //   返回的页面
  return (
    <div className={`app-container ${isMiniMode ? 'mini-mode' : ''} ${edgeCollapsedForUi ? 'edge-collapsed' : ''}`}>
      {/* 左侧导航 */}
      <aside className="sidebar" onPointerDownCapture={onSidebarPointerDownCapture}>
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
