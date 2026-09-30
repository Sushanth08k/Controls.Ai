package controls

default allow = false

# Rule 1: Read operations are permitted if a valid catalog_ref is provided
allow {
    input.side_effect == "read"
    input.catalog_ref != null
    input.catalog_ref != ""
}

# Rule 2: Reversible writes permitted only during specified active workflow states
allow {
    input.side_effect == "reversible_write"
    valid_reversible_state[input.workflow_state]
    input.target != null
}

valid_reversible_state["ACT"]
valid_reversible_state["COPY"]
valid_reversible_state["TEST"]

# Rule 3: Irreversible writes strictly require valid attestation and COMMIT state
allow {
    input.side_effect == "irreversible_write"
    input.workflow_state == "COMMIT"
    input.attestation != null
    input.attestation.run_id == input.run_id
    input.attestation.signature != null
    input.attestation.signature != ""
    input.gate_approved == true
}

# Rule 4: Maker-checker approval validity check
valid_approval {
    input.maker_id != input.approver_id
    input.approver_roles[_] == input.required_role
}
