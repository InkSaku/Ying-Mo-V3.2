from contextvars import ContextVar

_execution = ContextVar("spark_execution")


def execution_config():
    return _execution.get()["config"]


def execution_state():
    return _execution.get()["state"]
