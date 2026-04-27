export type Instruction = string | [string, string];
export type TreeInstruction = Instruction | [string, string, InstructionTree]
export type FlatInstruction = Instruction | [string, string, Instruction[]]

export type InstructionTree = { instruction: TreeInstruction, children?: InstructionTree[] }