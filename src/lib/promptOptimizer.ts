import type { PromptMode } from "../types";

const hasCjk = (value: string) => /[\u3400-\u9fff]/.test(value);

export function optimizePrompt(input: string, mode: PromptMode): string {
  const task = input.trim();
  if (!task) return "";
  return hasCjk(task) ? optimizeChinese(task, mode) : optimizeEnglish(task, mode);
}

function optimizeChinese(task: string, mode: PromptMode) {
  const templates: Record<PromptMode, string> = {
    smart: `请完成以下任务：\n${task}\n\n要求：\n1. 先明确目标、关键条件与可能的歧义。\n2. 信息不足时，优先指出必要假设，不要编造事实。\n3. 给出结构清晰、可直接执行的结果。\n4. 最后检查结果是否完整满足原始需求。`,
    concise: `任务：${task}\n\n请直接给出最简洁且可执行的答案。保留关键条件，删除重复说明；如有必要，用短列表呈现。`,
    detailed: `请深入完成以下任务：\n${task}\n\n请包含：\n- 目标与范围\n- 必要背景或假设\n- 分步骤方案\n- 关键风险与边界条件\n- 最终可执行结论\n\n不要为了显得详细而添加无关内容。`,
    coding: `你是一名注重可靠性与可维护性的资深软件工程师。\n\n任务：\n${task}\n\n要求：\n- 先判断技术约束和已有上下文。\n- 给出可运行或可直接集成的实现。\n- 处理错误、边界条件与平台差异。\n- 避免不必要的依赖和过度设计。\n- 如修改现有代码，明确文件与改动点。\n- 最后给出验证方法。`,
    writing: `请根据下面的需求完成写作：\n${task}\n\n写作要求：\n- 先识别受众、目的和语气。\n- 逻辑自然，避免空话和重复。\n- 保留必要信息，不擅自添加未经证实的事实。\n- 输出最终可直接使用的成稿。`,
    image: `请把以下想法转化为高质量图像生成提示词：\n${task}\n\n请明确：主体、场景、构图、镜头/视角、光线、材质、色彩氛围和必要细节。避免互相冲突的描述，并保留原始创意重点。`,
    analysis: `请系统分析以下问题：\n${task}\n\n要求：\n1. 区分已知事实、合理推断与不确定信息。\n2. 从多个可能解释或方案进行比较。\n3. 明确关键证据、风险和反例。\n4. 给出结构化结论，并说明结论成立的条件。`
  };
  return templates[mode];
}

function optimizeEnglish(task: string, mode: PromptMode) {
  const templates: Record<PromptMode, string> = {
    smart: `Complete the following task:\n${task}\n\nRequirements:\n1. Identify the goal, constraints, and any material ambiguity first.\n2. If information is missing, state necessary assumptions instead of inventing facts.\n3. Produce a structured, directly usable result.\n4. Check that the final output fully satisfies the original request.`,
    concise: `Task: ${task}\n\nGive the shortest useful, directly actionable answer. Preserve important constraints and remove repetition. Use a short list only when it improves clarity.`,
    detailed: `Work through the following task in depth:\n${task}\n\nInclude the goal and scope, necessary assumptions, a step-by-step approach, key risks or edge cases, and a directly actionable conclusion. Avoid irrelevant detail.`,
    coding: `Act as a senior software engineer focused on reliability and maintainability.\n\nTask:\n${task}\n\nRequirements:\n- Identify technical constraints and existing context first.\n- Provide runnable or directly integrable code.\n- Handle errors, edge cases, and platform differences.\n- Avoid unnecessary dependencies and over-engineering.\n- When modifying code, identify files and exact changes.\n- Finish with a verification method.`,
    writing: `Create polished writing for the following request:\n${task}\n\nFirst infer the audience, purpose, and tone. Keep the flow natural and specific, avoid filler and repetition, do not invent unsupported facts, and output a finished version ready to use.`,
    image: `Turn the following idea into a strong image-generation prompt:\n${task}\n\nSpecify the subject, environment, composition, camera/viewpoint, lighting, materials, color mood, and necessary details. Avoid contradictory instructions while preserving the original creative intent.`,
    analysis: `Analyze the following problem systematically:\n${task}\n\nRequirements:\n1. Separate known facts, reasonable inferences, and uncertainty.\n2. Compare multiple plausible explanations or options.\n3. Surface key evidence, risks, and counterexamples.\n4. Give a structured conclusion and state the conditions under which it holds.`
  };
  return templates[mode];
}
