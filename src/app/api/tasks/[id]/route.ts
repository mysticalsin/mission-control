import { NextRequest, NextResponse } from 'next/server';
import { getDatabase, db_helpers } from '@/lib/db';
import { eventBus } from '@/lib/event-bus';
import { apiGuard } from '@/lib/api-guard';
import { logger } from '@/lib/logger';
import { validateBody, updateTaskSchema } from '@/lib/validation';
import { removeTaskFromGnap } from '@/lib/gnap-sync';
import { config } from '@/lib/config';
import { mapTaskRow, fetchTaskById, handleTaskUpdate, type TaskWithGitHub } from './task-helpers';

/**
 * GET /api/tasks/[id] - Get a specific task
 */
export function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  return apiGuard({ role: 'viewer', rateLimit: 'read' }, async (req, auth) => {
    try {
      const db = getDatabase();
      const resolvedParams = await params;
      const taskId = parseInt(resolvedParams.id);
      const workspaceId = auth.user.workspace_id ?? 1;

      if (isNaN(taskId)) {
        return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 });
      }

      const task = db.prepare(`
        SELECT t.*, p.name as project_name, p.ticket_prefix as project_prefix
        FROM tasks t
        LEFT JOIN projects p ON p.id = t.project_id AND p.workspace_id = t.workspace_id
        WHERE t.id = ? AND t.workspace_id = ?
      `).get(taskId, workspaceId) as TaskWithGitHub;

      if (!task) {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      }

      return NextResponse.json({ task: mapTaskRow(task) });
    } catch (error) {
      logger.error({ err: error }, 'GET /api/tasks/[id] error');
      return NextResponse.json({ error: 'Failed to fetch task' }, { status: 500 });
    }
  })(request)
}

/**
 * PUT /api/tasks/[id] - Update a specific task
 */
export function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  return apiGuard({ role: 'operator', rateLimit: 'mutation' }, async (req, auth) => {
    try {
      const resolvedParams = await params;
      const taskId = parseInt(resolvedParams.id);
      const workspaceId = auth.user.workspace_id ?? 1;

      if (isNaN(taskId)) {
        return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 });
      }

      const validated = await validateBody(request, updateTaskSchema);
      if ('error' in validated) return validated.error;

      return await handleTaskUpdate(taskId, workspaceId, auth.user.username, validated.data);
    } catch (error) {
      logger.error({ err: error }, 'PUT /api/tasks/[id] error');
      return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
    }
  })(request)
}

/**
 * PATCH /api/tasks/[id] - Partially update a specific task (alias for PUT)
 * Exists so REST-idiomatic PATCH calls are rate-limited identically to PUT.
 */
export function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  return apiGuard({ role: 'operator', rateLimit: 'mutation' }, async (req, auth) => {
    try {
      const resolvedParams = await params;
      const taskId = parseInt(resolvedParams.id);
      const workspaceId = auth.user.workspace_id ?? 1;

      if (isNaN(taskId)) {
        return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 });
      }

      const validated = await validateBody(request, updateTaskSchema);
      if ('error' in validated) return validated.error;

      return await handleTaskUpdate(taskId, workspaceId, auth.user.username, validated.data);
    } catch (error) {
      logger.error({ err: error }, 'PATCH /api/tasks/[id] error');
      return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
    }
  })(request)
}

/**
 * DELETE /api/tasks/[id] - Delete a specific task
 */
export function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  return apiGuard({ role: 'operator', rateLimit: 'mutation' }, async (req, auth) => {
    try {
      const db = getDatabase();
      const resolvedParams = await params;
      const taskId = parseInt(resolvedParams.id);
      const workspaceId = auth.user.workspace_id ?? 1;

      if (isNaN(taskId)) {
        return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 });
      }

      const task = fetchTaskById(taskId, workspaceId);
      if (!task) {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      }

      db.prepare('DELETE FROM tasks WHERE id = ? AND workspace_id = ?').run(taskId, workspaceId);

      db_helpers.logActivity(
        'task_deleted', 'task', taskId, auth.user.username,
        `Deleted task: ${task.title}`,
        { title: task.title, status: task.status, assigned_to: task.assigned_to },
        workspaceId
      );

      if (config.gnap.enabled && config.gnap.autoSync) {
        try { removeTaskFromGnap(taskId, config.gnap.repoPath) }
        catch (err) { logger.warn({ err, taskId }, 'GNAP sync failed for task deletion') }
      }

      eventBus.broadcast('task.deleted', { id: taskId, title: task.title });

      return NextResponse.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, 'DELETE /api/tasks/[id] error');
      return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 });
    }
  })(request)
}
