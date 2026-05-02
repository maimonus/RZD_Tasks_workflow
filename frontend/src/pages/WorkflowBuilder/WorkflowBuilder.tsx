import { useEffect, useMemo, useState } from 'react'
import ReactFlow, { Background, Controls, MarkerType, MiniMap, type Edge, type Node } from 'reactflow'
import axios from 'axios'
import api from '../../api/api'
import type { RoleName, WorkflowDefinition, WorkflowNode, WorkflowTransition } from '../../types'
import { getApiErrorMessage } from '../../utils/apiError'
import { roleLabel } from '../../utils/labels'
import { useAuth } from '../../store/authStore'

type ApprovalStep = {
  id: string
  label: string
  role: RoleName
}

const APPROVER_ROLES: RoleName[] = ['Manager', 'DepartmentHead', 'FinancialDirector', 'Admin']
const EDITOR_ROLES: RoleName[] = ['Admin', 'FinancialDirector', 'DepartmentHead']
const DEFAULT_TEMPLATE_NAME = 'Базовый маршрут согласования'

const createDefaultSteps = (): ApprovalStep[] => [
  { id: crypto.randomUUID(), label: 'Согласование менеджера', role: 'Manager' },
  { id: crypto.randomUUID(), label: 'Согласование руководителя отдела', role: 'DepartmentHead' },
]

const createBlankTemplate = () => ({
  definitionId: null as number | null,
  templateKey: crypto.randomUUID(),
  name: DEFAULT_TEMPLATE_NAME,
  steps: createDefaultSteps(),
})

const parseDefinitionSteps = (definition: WorkflowDefinition): ApprovalStep[] => {
  const nodesById = new Map(definition.definition.nodes.map((node) => [node.node_id, node]))
  const transitionsBySource = definition.definition.transitions.reduce<Map<string, WorkflowTransition[]>>((accumulator, transition) => {
    const bucket = accumulator.get(transition.source_node) ?? []
    bucket.push(transition)
    accumulator.set(transition.source_node, bucket)
    return accumulator
  }, new Map())

  const startNodeId =
    definition.definition.start_node ?? definition.definition.nodes.find((node) => node.node_type === 'start')?.node_id ?? 'start'

  const parsedSteps: ApprovalStep[] = []
  const visited = new Set<string>()
  let currentNodeId = startNodeId

  while (!visited.has(currentNodeId)) {
    visited.add(currentNodeId)

    const transitions = [...(transitionsBySource.get(currentNodeId) ?? [])].sort((left, right) => right.priority - left.priority)
    const nextTransition = transitions[0]
    if (!nextTransition) {
      break
    }

    const nextNode = nodesById.get(nextTransition.target_node)
    if (!nextNode || nextNode.node_type === 'end') {
      break
    }

    if (nextNode.node_type === 'approval') {
      parsedSteps.push({
        id: nextNode.node_id,
        label: nextNode.label,
        role: (nextNode.config.role_required as RoleName) ?? 'Manager',
      })
    }

    currentNodeId = nextNode.node_id
  }

  return parsedSteps.length > 0 ? parsedSteps : createDefaultSteps()
}

const WorkflowBuilder = () => {
  const { user } = useAuth()

  const canEditProcess = Boolean(user?.role?.name && EDITOR_ROLES.includes(user.role.name))

  const [definitions, setDefinitions] = useState<WorkflowDefinition[]>([])
  const [selectedDefinitionId, setSelectedDefinitionId] = useState<number | null>(null)
  const [templateKey, setTemplateKey] = useState<string>(() => createBlankTemplate().templateKey as string)
  const [name, setName] = useState(DEFAULT_TEMPLATE_NAME)
  const [steps, setSteps] = useState<ApprovalStep[]>(createDefaultSteps)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const applyTemplate = (definition: WorkflowDefinition | null) => {
    if (!definition) {
      const blank = createBlankTemplate()
      setSelectedDefinitionId(blank.definitionId)
      setTemplateKey(blank.templateKey)
      setName(blank.name)
      setSteps(blank.steps)
      return
    }

    setSelectedDefinitionId(definition.id)
    setTemplateKey(definition.template_key)
    setName(definition.name)
    setSteps(parseDefinitionSteps(definition))
  }

  const loadDefinitions = async (preferredDefinitionId?: number | null) => {
    setIsLoading(true)
    setError(null)

    try {
      const { data } = await api.get<WorkflowDefinition[]>('/workflow/definitions')
      setDefinitions(data)

      const preferredDefinition = preferredDefinitionId ? data.find((item) => item.id === preferredDefinitionId) ?? null : null
      const currentDefinition = selectedDefinitionId ? data.find((item) => item.id === selectedDefinitionId) ?? null : null
      const nextDefinition = preferredDefinition ?? currentDefinition ?? data.find((item) => item.published) ?? data[0] ?? null

      applyTemplate(nextDefinition)
    } catch (caughtError) {
      if (axios.isAxiosError(caughtError)) {
        setError(getApiErrorMessage(caughtError.response?.data?.detail, 'Не удалось загрузить шаблоны процессов'))
      } else {
        setError('Не удалось загрузить шаблоны процессов')
      }

      setDefinitions([])
      applyTemplate(null)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadDefinitions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectedDefinition = useMemo(
    () => definitions.find((definition) => definition.id === selectedDefinitionId) ?? null,
    [definitions, selectedDefinitionId],
  )

  const flowNodes = useMemo<Node[]>(
    () => [
      {
        id: 'start',
        type: 'input',
        data: { label: <div className="text-sm font-semibold">Старт</div> },
        position: { x: 32, y: 110 },
        style: {
          width: 160,
          borderRadius: 20,
          border: '1px solid #decfc8',
          background: '#fff7f7',
          color: '#231815',
          boxShadow: '0 12px 28px rgba(149,20,29,0.08)',
        },
      },
      ...steps.map((step, index) => ({
        id: step.id,
        data: {
          label: (
            <div className="space-y-2">
              <div className="text-sm font-semibold leading-5 text-slate-900">{step.label}</div>
              <div className="text-xs uppercase tracking-[0.16em] text-slate-500">{roleLabel(step.role)}</div>
            </div>
          ),
        },
        position: { x: 272 * (index + 1), y: 110 },
        style: {
          width: 220,
          borderRadius: 24,
          border: '1px solid #f1c9cd',
          background: 'linear-gradient(180deg,#fffefe 0%,#fbe8ea 100%)',
          color: '#231815',
          boxShadow: '0 14px 36px rgba(149,20,29,0.1)',
          padding: '8px 10px',
        },
      })),
      {
        id: 'end',
        type: 'output',
        data: { label: <div className="text-sm font-semibold">Завершение</div> },
        position: { x: 272 * (steps.length + 1), y: 110 },
        style: {
          width: 170,
          borderRadius: 20,
          border: '1px solid #decfc8',
          background: '#fff7f7',
          color: '#231815',
          boxShadow: '0 12px 28px rgba(149,20,29,0.08)',
        },
      },
    ],
    [steps],
  )

  const flowEdges = useMemo<Edge[]>(() => {
    const ids = ['start', ...steps.map((step) => step.id), 'end']
    return ids.slice(0, -1).map((nodeId, index) => ({
      id: `${nodeId}-${ids[index + 1]}`,
      source: nodeId,
      target: ids[index + 1],
      animated: true,
      markerEnd: { type: MarkerType.ArrowClosed, color: '#d22630' },
      style: { stroke: '#d22630', strokeWidth: 1.6 },
    }))
  }, [steps])

  const buildPayload = (published: boolean) => {
    const nodes: WorkflowNode[] = [
      { node_id: 'start', node_type: 'start' as const, label: 'Старт', config: {} },
      ...steps.map((step, index) => ({
        node_id: step.id || `approval-${index + 1}`,
        node_type: 'approval' as const,
        label: step.label.trim() || `Согласование ${index + 1}`,
        config: { role_required: step.role },
      })),
      { node_id: 'end', node_type: 'end' as const, label: 'Финиш', config: {} },
    ]

    const transitions: WorkflowTransition[] = nodes.slice(0, -1).map((node, index) => ({
      source_node: node.node_id,
      target_node: nodes[index + 1].node_id,
      condition: {},
      priority: 0,
    }))

    return {
      name: name.trim() || DEFAULT_TEMPLATE_NAME,
      template_key: templateKey,
      start_node: 'start',
      nodes,
      transitions,
      published,
    }
  }

  const handleCreateTemplate = () => {
    applyTemplate(null)
    setError(null)
    setSuccess(null)
  }

  const handleSelectDefinition = (definition: WorkflowDefinition) => {
    applyTemplate(definition)
    setError(null)
    setSuccess(null)
  }

  const handleSave = async (published: boolean) => {
    setIsSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const { data } = await api.post<WorkflowDefinition>('/workflow/definitions', buildPayload(published))
      await loadDefinitions(data.id)
      setSuccess(published ? 'Шаблон опубликован' : 'Шаблон сохранен как черновик')
    } catch (caughtError) {
      if (axios.isAxiosError(caughtError)) {
        setError(getApiErrorMessage(caughtError.response?.data?.detail, 'Не удалось сохранить шаблон процесса'))
      } else {
        setError('Не удалось сохранить шаблон процесса')
      }
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteTemplate = async () => {
    if (!selectedDefinitionId) {
      handleCreateTemplate()
      return
    }

    const confirmed = window.confirm('Удалить выбранный шаблон процесса? Будут удалены все его сохраненные версии.')
    if (!confirmed) {
      return
    }

    setIsDeleting(true)
    setError(null)
    setSuccess(null)

    try {
      await api.delete(`/workflow/definitions/${selectedDefinitionId}`)
      await loadDefinitions()
      setSuccess('Шаблон процесса удален')
    } catch (caughtError) {
      if (axios.isAxiosError(caughtError)) {
        setError(getApiErrorMessage(caughtError.response?.data?.detail, 'Не удалось удалить шаблон процесса'))
      } else {
        setError('Не удалось удалить шаблон процесса')
      }
    } finally {
      setIsDeleting(false)
    }
  }

  const handleStepChange = (stepId: string, patch: Partial<ApprovalStep>) => {
    setSteps((current) => current.map((step) => (step.id === stepId ? { ...step, ...patch } : step)))
  }

  const handleAddStep = () => {
    setSteps((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        label: `Согласование ${current.length + 1}`,
        role: 'Manager',
      },
    ])
  }

  const handleRemoveStep = (stepId: string) => {
    setSteps((current) => current.filter((step) => step.id !== stepId))
  }

  const templateMetaLabel = selectedDefinition
    ? `Версия ${selectedDefinition.version}${selectedDefinition.published ? ' • опубликован' : ' • черновик'}`
    : 'Новый шаблон'

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Конструктор процессов</h1>
            </div>
          {canEditProcess ? (
            <div className="flex flex-wrap gap-3">
              <button
                className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                onClick={handleCreateTemplate}
                type="button"
              >
                Новый шаблон
              </button>
              <button
                className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSaving || isDeleting || !name.trim() || steps.length === 0}
                onClick={() => {
                  void handleSave(false)
                }}
                type="button"
              >
                {isSaving ? 'Сохраняем...' : 'Сохранить черновик'}
              </button>
              <button
                className="rounded-2xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-sky-300"
                disabled={isSaving || isDeleting || !name.trim() || steps.length === 0}
                onClick={() => {
                  void handleSave(true)
                }}
                type="button"
              >
                {isSaving ? 'Публикуем...' : 'Опубликовать'}
              </button>
              <button
                className="rounded-2xl border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSaving || isDeleting || !selectedDefinitionId}
                onClick={() => {
                  void handleDeleteTemplate()
                }}
                type="button"
              >
                {isDeleting ? 'Удаляем...' : 'Удалить шаблон'}
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              <span className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700">Только просмотр</span>
            </div>
          )}
        </div>
      </section>

      {error ? (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{error}</div>
      ) : null}

      {success ? (
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">
          {success}
        </div>
      ) : null}

      <section
        className={
          canEditProcess
            ? 'grid gap-6 xl:grid-cols-[320px_420px_minmax(0,1fr)]'
            : 'grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]'
        }
      >
        <aside className="rounded-[2rem] bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-slate-900">Шаблоны</h2>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{definitions.length}</span>
          </div>

          {isLoading ? (
            <div className="mt-5 rounded-3xl bg-slate-50 px-4 py-6 text-sm text-slate-500">Загружаем шаблоны...</div>
          ) : definitions.length === 0 ? (
            <div className="mt-5 rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
              Сохраненных шаблонов пока нет. Создайте первый маршрут и сохраните его как черновик.
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {definitions.map((definition) => {
                const isActive = definition.id === selectedDefinitionId
                return (
                  <button
                    key={definition.id}
                    className={`w-full rounded-3xl border px-4 py-4 text-left transition ${
                      isActive
                        ? 'border-sky-200 bg-sky-50/90 shadow-sm'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                    onClick={() => handleSelectDefinition(definition)}
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{definition.name}</div>
                        <div className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500">Версия {definition.version}</div>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${
                          definition.published ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {definition.published ? 'Опубликован' : 'Черновик'}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </aside>

        {canEditProcess ? (
          <div className="rounded-[2rem] bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-slate-900">Настройка процесса</h2>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{templateMetaLabel}</span>
            </div>

            {isLoading ? (
              <div className="mt-5 rounded-3xl bg-slate-50 px-4 py-6 text-sm text-slate-500">Подготавливаем редактор...</div>
            ) : (
              <div className="mt-5 space-y-4">
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">Название процесса</span>
                  <input
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-sky-400"
                    onChange={(event) => setName(event.target.value)}
                    value={name}
                  />
                </label>

                <div className="space-y-3">
                  {steps.map((step, index) => (
                    <div key={step.id} className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-sm font-semibold text-slate-900">Шаг {index + 1}</h3>
                        {steps.length > 1 ? (
                          <button
                            className="rounded-xl border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-50"
                            onClick={() => handleRemoveStep(step.id)}
                            type="button"
                          >
                            Удалить
                          </button>
                        ) : null}
                      </div>

                      <div className="mt-3 space-y-3">
                        <label className="block space-y-2">
                          <span className="text-sm font-medium text-slate-700">Название шага</span>
                          <input
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-sky-400"
                            onChange={(event) => handleStepChange(step.id, { label: event.target.value })}
                            value={step.label}
                          />
                        </label>

                        <label className="block space-y-2">
                          <span className="text-sm font-medium text-slate-700">Кто согласует</span>
                          <select
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-sky-400"
                            onChange={(event) => handleStepChange(step.id, { role: event.target.value as RoleName })}
                            value={step.role}
                          >
                            {APPROVER_ROLES.map((role) => (
                              <option key={role} value={role}>
                                {roleLabel(role)}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  className="w-full rounded-2xl border border-dashed border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  onClick={handleAddStep}
                  type="button"
                >
                  Добавить шаг согласования
                </button>
              </div>
            )}
          </div>
        ) : null}

        <div className="rounded-[2rem] bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3 px-2">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Предпросмотр маршрута</h2>
            </div>
          </div>
          <div className="h-[520px] overflow-hidden rounded-[1.5rem] border border-slate-200 bg-[radial-gradient(circle_at_top,#fffefe_0%,#fbf1f2_38%,#f7efeb_100%)]">
            <ReactFlow
              fitView
              fitViewOptions={{ padding: 0.2 }}
              edges={flowEdges}
              nodes={flowNodes}
              nodesConnectable={false}
              nodesDraggable={false}
              elementsSelectable={false}
              panOnDrag
              proOptions={{ hideAttribution: true }}
            >
              <MiniMap
                pannable
                zoomable
                nodeBorderRadius={12}
                nodeColor={(node) => (node.id === 'start' || node.id === 'end' ? '#fbe8ea' : '#d22630')}
              />
              <Controls showInteractive={false} />
              <Background color="#e7d3cd" gap={18} />
            </ReactFlow>
          </div>
        </div>
      </section>
    </div>
  )
}

export default WorkflowBuilder
