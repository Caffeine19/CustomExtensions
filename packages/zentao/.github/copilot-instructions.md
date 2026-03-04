# Raycast Extension Copilot Instructions

## Development Guidelines

### Core Principles

- **Always use todos tool**: Use the `manage_todo_list` tool for complex multi-step work to track progress and ensure task visibility throughout the coding session.

- **Language**: Write comments in Chinese to match the project's target audience and existing codebase. However, always respond to the user in English for communication.

- **Date Handling**: Use `dayjs` instead of `new Date()` for all date operations

  ```typescript
  // ✅ 正确示例
  import dayjs from "dayjs";

  const formattedDate = dayjs().format("YYYY-MM-DD");
  const isToday = dayjs(taskDate).isSame(dayjs(), "day");

  // ❌ 错误示例
  const formattedDate = new Date().toISOString().split("T")[0];
  const isToday = new Date(taskDate).toDateString() === new Date().toDateString();
  ```

### JSDoc and Comments

Use JSDoc comments for functions, interfaces, and important type declarations only. Use regular single-line comments (`//`) for code logic explanations.

```typescript
// ✅ Correct usage - Functions
/**
 * 根据用户ID获取用户信息
 *
 * @param userId - 用户唯一标识符
 * @param options - 查询选项
 * @returns 用户信息对象
 */
function getUserById(userId: string, options?: QueryOptions): User {
  // 验证用户ID格式
  if (!isValidUserId(userId)) {
    throw new Error("Invalid user ID");
  }

  // 从数据库查询用户
  const user = database.findUser(userId);

  return user;
}

// ✅ Correct usage - Interfaces
/** 用户信息接口 */
interface User {
  /** 用户唯一标识符 */
  id: string;
  /** 用户名 */
  name: string;
  /** 邮箱地址 */
  email: string;
  /** 创建时间 */
  createdAt: Date;
}

// ✅ Correct usage - Type aliases
/** 用户状态枚举 */
type UserStatus = "active" | "inactive" | "pending" | "banned";

// ✅ Correct usage - Important constants
/** 默认用户配置信息 */
const userInfo = {
  defaultRole: "user",
  maxLoginAttempts: 3,
  sessionTimeout: 30 * 60 * 1000,
};

// ❌ Incorrect usage - don't use JSDoc for inline comments
function createPost(postData: PostData): Post {
  /** Validate post data */ // Should be: // Validate post data
  if (!postData.title) {
    throw new Error("Title is required");
  }

  /** Save to database */ // Should be: // Save to database
  const post = database.save(postData);

  return post;
}
```

### TypeScript Conventions

- Strict TypeScript with `isolatedModules: true`
- Interface-first design - see `types/` directory
- **Type References**: Use existing type references like `taskId: Task['id']` instead of primitive types like `taskId: string`

## Architecture Overview

This is a **Raycast extension** for Zentao project management system integration. The architecture follows Raycast's conventions with React + TypeScript, focusing on task management and completion workflows.

### Key Components & Data Flow

- **Main Command**: `search-my-tasks.tsx` - List view with sorting, filtering, and task actions
- **Task Service**: `utils/taskService.ts` - Handles all Zentao API communication via HTML scraping
- **Components**: `TaskDetail.tsx` (read-only view) + `FinishTaskForm.tsx` (task completion)
- **Data Flow**: Zentao HTML → Cheerio parsing → TypeScript interfaces → Raycast UI

### Zentao Integration Pattern

**Critical**: This extension works by scraping Zentao's HTML pages, not REST APIs. Authentication uses session cookies (`zentaosid`).

```typescript
// Pattern: All Zentao requests include these headers
headers: {
  Cookie: `zentaosid=${zentaoSid}; lang=zh-cn; device=desktop; theme=default; keepLogin=on; za=${username}`,
  "User-Agent": "Mozilla/5.0...", // Required for proper HTML rendering
}
```

## Development Patterns

### I18n Implementation

Uses custom i18n system (not react-i18next despite dependency). **Key pattern**:

- All user-facing strings use `t()` function from `utils/i18n.ts`
- Language detection from user preferences: `"zh-CN" | "en-US"`
- Supports interpolation: `t("foundTasks", { count: tasks.length })`

### Constants Organization

Enums + utility functions pattern for UI consistency:

- `constants/status.ts` - TaskStatus enum with colors, icons, labels
- `constants/priority.ts` - TaskPriority enum (numbers 1-4, lower = higher priority)
- `constants/colors.ts` - Tailwind color palette for consistent theming

### State Management

Uses React hooks with specific patterns:

- `useState` for local component state
- `useMemo` for expensive sorting operations
- `useForm` (react-hook-form) for complex forms with validation
- No global state management - Raycast preferences handle config

### Debugging Zentao Integration

The extension logs HTML responses to `/log/` directory for debugging:

- `my-task.html` - Main task list page
- `task-finish-form.html` - Task completion form
- `task-finish-response.log` - Form submission responses

**Critical**: When Zentao integration breaks, check these logs first to understand HTML structure changes.

## Zentao-Specific Implementation Details

### Task Parsing Strategy

HTML parsing uses Cheerio with fallback selectors:

```typescript
const taskSelectors = [
  "tr[data-id]", // Primary: rows with data-id
  "tbody tr", // Fallback: all table rows
  ".table tr", // Alternative: table class
  "#taskTable tr", // Specific table ID
];
```

### Task Completion Workflow

1. Fetch form details from `/task-finish-{taskId}.html?onlybody=yes`
2. Parse team members dropdown and extract `uid` from JavaScript
3. Submit FormData to same URL with all required fields
4. Check response for success indicators (`parent.parent.location.reload()`)

### Priority Mapping

Zentao uses numeric priorities (1-4) mapped to semantic labels:

- `1` → "Critical" (red)
- `2` → "High" (amber)
- `3` → "Medium" (blue)
- `4` → "Low" (green)

## Error Handling Patterns

### Toast Notifications

Consistent error feedback using Raycast's toast system:

```typescript
showToast({
  style: Toast.Style.Failure,
  title: t("failedToFetchTasks"),
  message: error instanceof Error ? error.message : t("unknownError"),
});
```

### Form Validation

Uses react-hook-form with Raycast form components. Validation errors display inline with form fields.

## Testing & Debugging

- No automated tests currently - manual testing workflow
- Use log files in `/log/` directory for debugging Zentao responses
- Raycast dev console shows network requests and React errors
- Test with both Chinese and English locales

## Architecture Overview

This is a **Raycast extension** for Zentao project management system integration. The architecture follows Raycast's conventions with React + TypeScript, focusing on task management and completion workflows.

### Key Components & Data Flow

- **Main Command**: `search-my-tasks.tsx` - List view with sorting, filtering, and task actions
- **Task Service**: `utils/taskService.ts` - Handles all Zentao API communication via HTML scraping
- **Components**: `TaskDetail.tsx` (read-only view) + `FinishTaskForm.tsx` (task completion)
- **Data Flow**: Zentao HTML → Cheerio parsing → TypeScript interfaces → Raycast UI

### Zentao Integration Pattern

**Critical**: This extension works by scraping Zentao's HTML pages, not REST APIs. Authentication uses session cookies (`zentaosid`).

```typescript
// Pattern: All Zentao requests include these headers
headers: {
  Cookie: `zentaosid=${zentaoSid}; lang=zh-cn; device=desktop; theme=default; keepLogin=on; za=${username}`,
  "User-Agent": "Mozilla/5.0...", // Required for proper HTML rendering
}
```

## Development Patterns

### I18n Implementation

Uses custom i18n system (not react-i18next despite dependency). **Key pattern**:

- All user-facing strings use `t()` function from `utils/i18n.ts`
- Language detection from user preferences: `"zh-CN" | "en-US"`
- Supports interpolation: `t("foundTasks", { count: tasks.length })`

### Constants Organization

Enums + utility functions pattern for UI consistency:

- `constants/status.ts` - TaskStatus enum with colors, icons, labels
- `constants/priority.ts` - TaskPriority enum (numbers 1-4, lower = higher priority)
- `constants/colors.ts` - Tailwind color palette for consistent theming

### State Management

Uses React hooks with specific patterns:

- `useState` for local component state
- `useMemo` for expensive sorting operations
- `useForm` (react-hook-form) for complex forms with validation
- No global state management - Raycast preferences handle config

### Debugging Zentao Integration

The extension logs HTML responses to `/log/` directory for debugging:

- `my-task.html` - Main task list page
- `task-finish-form.html` - Task completion form
- `task-finish-response.log` - Form submission responses

**Critical**: When Zentao integration breaks, check these logs first to understand HTML structure changes.

### TypeScript Conventions

- Strict TypeScript with `isolatedModules: true`
- Interface-first design - see `types/` directory
- Raycast API types auto-generated in `raycast-env.d.ts`
- Preferences typed as global `Preferences` interface
- **Type References**: Use existing type references like `taskId: Task['id']` instead of primitive types like `taskId: string`

### Code Comments & Documentation

- **Examples**: See `utils/taskService.ts` for proper Chinese JSDoc documentation patterns

## Zentao-Specific Implementation Details

### Task Parsing Strategy

HTML parsing uses Cheerio with fallback selectors:

```typescript
const taskSelectors = [
  "tr[data-id]", // Primary: rows with data-id
  "tbody tr", // Fallback: all table rows
  ".table tr", // Alternative: table class
  "#taskTable tr", // Specific table ID
];
```

### Task Completion Workflow

1. Fetch form details from `/task-finish-{taskId}.html?onlybody=yes`
2. Parse team members dropdown and extract `uid` from JavaScript
3. Submit FormData to same URL with all required fields
4. Check response for success indicators (`parent.parent.location.reload()`)

### Priority Mapping

Zentao uses numeric priorities (1-4) mapped to semantic labels:

- `1` → "Critical" (red)
- `2` → "High" (amber)
- `3` → "Medium" (blue)
- `4` → "Low" (green)

## Error Handling Patterns

### Toast Notifications

Consistent error feedback using Raycast's toast system:

```typescript
showToast({
  style: Toast.Style.Failure,
  title: t("failedToFetchTasks"),
  message: error instanceof Error ? error.message : t("unknownError"),
});
```

### Form Validation

Uses react-hook-form with Raycast form components. Validation errors display inline with form fields.
