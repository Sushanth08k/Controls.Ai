from abc import ABC, abstractmethod
from typing import Any, Literal
from pydantic import BaseModel, ConfigDict


class OperationDescriptor(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    name: str
    side_effect: Literal["read", "reversible_write", "irreversible_write"]
    role_template: str
    description: str


class ConnectorDescription(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    name: str
    version: str
    operations: list[OperationDescriptor]


class BaseConnector(ABC):
    """Abstract Base Class for all Platform Connectors (MCP Protocol Provider)."""

    @abstractmethod
    def describe(self) -> ConnectorDescription:
        """Return connector capabilities, operations, and side-effect classes."""
        pass

    @abstractmethod
    def health(self) -> bool:
        """Health check for connector and underlying resource."""
        pass

    @abstractmethod
    def execute(self, operation: str, args: dict[str, Any], context: dict[str, Any]) -> Any:
        """Execute a catalog-driven parameterized operation."""
        pass
