from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict, List, Optional

class NodeType(str, Enum):
    START = 'start'
    APPROVAL = 'approval'
    CONDITION = 'condition'
    END = 'end'

@dataclass
class ProcessNodeDescriptor:
    node_id: str
    node_type: NodeType
    label: str
    config: Dict[str, Any]

@dataclass
class ProcessTransitionDescriptor:
    source_node: str
    target_node: str
    condition: Dict[str, Any]
    priority: int = 0

@dataclass
class ProcessDefinitionDescriptor:
    definition_id: int
    name: str
    version: int
    nodes: List[ProcessNodeDescriptor]
    transitions: List[ProcessTransitionDescriptor]
    start_node: Optional[str] = None

@dataclass
class ApprovalTaskDescriptor:
    assigned_role: str
    assigned_user_id: Optional[int]
    node_id: str

class ProcessInstanceState(str, Enum):
    ACTIVE = 'active'
    REJECTED = 'rejected'
    COMPLETED = 'completed'

class WorkflowEngine:
    def __init__(self, definition: ProcessDefinitionDescriptor):
        self.definition = definition

    def find_node(self, node_id: str) -> Optional[ProcessNodeDescriptor]:
        return next((node for node in self.definition.nodes if node.node_id == node_id), None)

    def get_start_node(self) -> Optional[ProcessNodeDescriptor]:
        if self.definition.start_node:
            return self.find_node(self.definition.start_node)
        return next((node for node in self.definition.nodes if node.node_type == NodeType.START), None)

    def get_transitions(self, source_node: str) -> List[ProcessTransitionDescriptor]:
        return [transition for transition in self.definition.transitions if transition.source_node == source_node]

    def evaluate_condition(self, condition: Dict[str, Any], context: Dict[str, Any]) -> bool:
        if not condition:
            return True
        field = condition.get('field')
        op = condition.get('operator')
        value = condition.get('value')
        actual = context.get(field)
        if op == '>':
            return actual is not None and actual > value
        if op == '<':
            return actual is not None and actual < value
        if op == '==':
            return actual == value
        if op == '!=':
            return actual != value
        return False

    def choose_next_node(self, source_node: str, context: Dict[str, Any]) -> Optional[ProcessNodeDescriptor]:
        transitions = sorted(self.get_transitions(source_node), key=lambda t: t.priority, reverse=True)
        for transition in transitions:
            if self.evaluate_condition(transition.condition, context):
                return self.find_node(transition.target_node)
        return None

    def create_first_approval(self, context: Dict[str, Any]) -> Optional[ApprovalTaskDescriptor]:
        start_node = self.get_start_node()
        if not start_node:
            return None
        next_node = self.choose_next_node(start_node.node_id, context)
        if not next_node or next_node.node_type != NodeType.APPROVAL:
            return None
        return ApprovalTaskDescriptor(
            assigned_role=next_node.config.get('role_required', ''),
            assigned_user_id=next_node.config.get('assigned_user_id'),
            node_id=next_node.node_id,
        )

    def advance(self, current_node_id: str, decision: str, context: Dict[str, Any]) -> Dict[str, Any]:
        result = {'status': ProcessInstanceState.ACTIVE.value, 'next_node': None, 'completed': False}
        if decision == 'reject':
            result['status'] = ProcessInstanceState.REJECTED.value
            return result
        next_node = self.choose_next_node(current_node_id, context)
        if not next_node:
            result['status'] = ProcessInstanceState.COMPLETED.value
            result['completed'] = True
            return result
        result['next_node'] = next_node.node_id
        if next_node.node_type == NodeType.END:
            result['status'] = ProcessInstanceState.COMPLETED.value
            result['completed'] = True
        return result

workflow_engine = WorkflowEngine
