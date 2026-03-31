import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  verticalListSortingStrategy, useSortable
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DashboardLayout } from "../components/DashboardLayout";
import { approvalRuleApi } from "../lib/api";
import {
  Settings, Plus, Trash2, GripVertical, Info, FileText, Anchor, Activity, Clock, Star
} from "lucide-react";

const DEFAULT_CATEGORIES = [
  { value: "", label: "All Categories" },
  { value: "meals", label: "Meals & Food" },
  { value: "travel", label: "Travel" },
  { value: "accommodation", label: "Accommodation" },
  { value: "transport", label: "Transport" },
  { value: "office_supplies", label: "Office Supplies" },
  { value: "entertainment", label: "Entertainment" },
  { value: "communication", label: "Communication" },
  { value: "software", label: "Software & Subscriptions" },
  { value: "equipment", label: "Equipment" },
  { value: "other", label: "Other" }
];

const fadeIn = (delay = 0) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, delay, ease: "easeOut" }
});

function SortableStep({ id, step, index, approvers, updateStep, removeStep }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : 1 };

  return (
    <div ref={setNodeRef} style={style} className={`flex items-center gap-3 p-3 rounded-xl border bg-white ${isDragging ? "shadow-xl border-indigo-400 opacity-90" : "shadow-sm border-slate-200"}`}>
      <button type="button" className="cursor-grab active:cursor-grabbing p-1 text-slate-400 hover:text-slate-600" {...attributes} {...listeners}>
        <GripVertical size={16} />
      </button>
      <span className="text-xs font-bold text-slate-400 w-6 flex-shrink-0">
        #{index + 1}
      </span>
      <select
        value={step.approver_id}
        onChange={(e) => updateStep(index, e.target.value)}
        className="input flex-1 py-1.5 px-3 min-w-0"
        required
      >
        <option value="">Select approver</option>
        {approvers.map((a) => (
          <option key={a.id} value={a.id}>{a.full_name} — {a.job_title} ({a.role})</option>
        ))}
      </select>
      <button type="button" onClick={() => removeStep(index)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0">
        <Trash2 size={16} />
      </button>
    </div>
  );
}

export function RuleBuilderPage() {
  const [rules, setRules] = useState([]);
  const [approvers, setApprovers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState(null);

  const [form, setForm] = useState({
    name: "", category: "", threshold_amount: "", is_default: false,
    min_approval_percentage: "", specific_approver_id: "", steps: []
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [rulesData, approversData] = await Promise.all([
        approvalRuleApi.getAll(), approvalRuleApi.getEligibleApprovers()
      ]);
      setRules(rulesData.rules || []);
      setApprovers(approversData.approvers || []);
    } catch (err) { setError(err.message); }
    finally { setIsLoading(false); }
  };

  const resetForm = () => {
    setForm({
      name: "", category: "", threshold_amount: "", is_default: false,
      min_approval_percentage: "", specific_approver_id: "", steps: []
    });
    setEditingRuleId(null); setError(null);
  };

  const loadRuleIntoForm = (rule) => {
    setForm({
      name: rule.name || "",
      category: rule.category || "",
      threshold_amount: rule.threshold_amount ?? "",
      is_default: rule.is_default || false,
      min_approval_percentage: rule.min_approval_percentage ?? "",
      specific_approver_id: rule.specific_approver_id || "",
      steps: (rule.steps || []).map((s) => ({
        id: `step-${Math.random().toString(36).substr(2, 9)}`,
        approver_id: s.approver_id,
        step_order: s.step_order
      }))
    });
    setEditingRuleId(rule.id); setError(null); setSuccess(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(null); setIsSubmitting(true);
    try {
      if (!form.name.trim()) throw new Error("Rule name is required");
      const payload = {
        name: form.name.trim(),
        category: form.category || null,
        threshold_amount: form.threshold_amount !== "" ? parseFloat(form.threshold_amount) : null,
        is_default: form.is_default,
        is_manager_approver: false,
        min_approval_percentage: form.min_approval_percentage !== "" ? parseInt(form.min_approval_percentage) : null,
        specific_approver_id: form.specific_approver_id || null,
        steps: form.steps.map((s, i) => ({ approver_id: s.approver_id, step_order: i + 1 }))
      };

      if (editingRuleId) {
        await approvalRuleApi.update(editingRuleId, payload);
        setSuccess("Rule updated successfully!");
      } else {
        await approvalRuleApi.create(payload);
        setSuccess("Rule created successfully!");
      }
      resetForm(); loadData();
      setTimeout(() => setSuccess(null), 4000);
    } catch (err) { setError(err.message); }
    finally { setIsSubmitting(false); }
  };

  const handleDelete = async (e, ruleId) => {
    e.stopPropagation();
    if (!confirm("Delete this rule?")) return;
    try {
      await approvalRuleApi.delete(ruleId);
      setSuccess("Rule deleted");
      if (editingRuleId === ruleId) resetForm();
      loadData(); setTimeout(() => setSuccess(null), 3000);
    } catch (err) { setError(err.message); }
  };

  const addStep = () => {
    setForm(prev => ({
      ...prev,
      steps: [...prev.steps, { id: `step-${Math.random().toString(36).substr(2, 9)}`, approver_id: "", step_order: prev.steps.length + 1 }]
    }));
  };

  const removeStep = (index) => setForm(prev => ({ ...prev, steps: prev.steps.filter((_, i) => i !== index) }));
  const updateStep = (index, approver_id) => setForm(prev => ({ ...prev, steps: prev.steps.map((s, i) => (i === index ? { ...s, approver_id } : s)) }));

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      setForm((prev) => {
        const oldIndex = prev.steps.findIndex(s => s.id === active.id);
        const newIndex = prev.steps.findIndex(s => s.id === over.id);
        return { ...prev, steps: arrayMove(prev.steps, oldIndex, newIndex) };
      });
    }
  };

  const getApproverName = (id) => {
    const a = approvers.find((a) => a.id === id);
    return a ? `${a.full_name} (${a.job_title})` : id;
  };

  const getResolutionSummary = () => {
    const parts = [];
    const hasPct = form.min_approval_percentage !== "" && parseInt(form.min_approval_percentage) > 0;
    const hasSpec = form.specific_approver_id;
    if (hasPct && hasSpec) parts.push(`Approved when ${form.min_approval_percentage}% of approvers approve OR ${getApproverName(form.specific_approver_id)} approves — whichever happens first`);
    else if (hasPct) parts.push(`Approved when ${form.min_approval_percentage}% of sequential approvers have approved`);
    else if (hasSpec) parts.push(`${getApproverName(form.specific_approver_id)} can approve at any time, bypassing the sequential chain`);
    if (parts.length === 0) parts.push("Approved sequentially when all approvers approve in order");
    return parts.join(". ");
  };

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
        <motion.div {...fadeIn(0)} className="page-header flex flex-col sm:flex-row justify-between sm:items-end gap-4">
          <div>
            <h1 className="page-title flex items-center gap-2">
              <Settings size={24} style={{ color: "var(--accent)" }} /> Approval Rules
            </h1>
            <p className="page-subtitle">Configure intelligent approval chains and thresholds.</p>
          </div>
        </motion.div>

        <AnimatePresence>
          {error && <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="alert alert-danger mb-6">{error}</motion.div>}
          {success && <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="alert alert-success mt-4 mb-6">{success}</motion.div>}
        </AnimatePresence>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_2fr] gap-6 lg:gap-8">
          {/* Left panel: List */}
          <motion.div {...fadeIn(0.1)} className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">Configured Rules ({rules.length})</h2>
              <button onClick={resetForm} className="btn btn-secondary btn-sm" style={{ padding: "0 12px", height: "32px", fontSize: "12px" }}>
                <Plus size={14} /> New
              </button>
            </div>

            {isLoading ? (
              <div className="p-8 text-center text-slate-500 animate-pulse">Loading rules...</div>
            ) : rules.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon text-slate-400">📋</div>
                <div className="empty-state-title">No rules yet</div>
                <div className="empty-state-text">Create your first approval rule to control workflows.</div>
              </div>
            ) : (
              <div className="space-y-3">
                {rules.map((rule) => (
                  <div
                    key={rule.id}
                    onClick={() => loadRuleIntoForm(rule)}
                    className={`card p-4 flex items-start justify-between cursor-pointer transition-all ${
                      editingRuleId === rule.id ? "ring-2 ring-indigo-500 ring-offset-2 border-indigo-200 shadow-md" : "hover:border-slate-300 hover:shadow-sm"
                    }`}
                  >
                    <div className="min-w-0 pr-4">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-slate-900 truncate text-[14px]">{rule.name}</h3>
                        {rule.is_default && <span className="badge badge-warning text-[10px] py-0 -mt-0.5">Default</span>}
                      </div>
                      <p className="text-xs text-slate-500 truncate mb-2">
                        {rule.category ? DEFAULT_CATEGORIES.find(c => c.value === rule.category)?.label || rule.category : "All Categories"}
                      </p>
                      <div className="flex items-center gap-3 text-[11px] font-semibold text-slate-400">
                        {rule.threshold_amount && <span className="bg-slate-100 px-1.5 py-0.5 rounded">≥ {rule.threshold_amount}</span>}
                        <span className="flex items-center gap-1"><Users size={12} /> {rule.steps?.length || 0} Steps</span>
                        {rule.specific_approver_id && <span className="flex items-center gap-1 opacity-80"><Star size={10} className="text-purple-500 fill-purple-500" /></span>}
                      </div>
                    </div>
                    <button onClick={(e) => handleDelete(e, rule.id)} className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 flex-shrink-0 rounded-lg transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </motion.div>

          {/* Right panel: Editor */}
          <motion.div {...fadeIn(0.2)}>
            <form onSubmit={handleSubmit} className="card overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
                <h2 className="text-base font-bold text-slate-900 font-heading flex items-center gap-2">
                  <Edit3 size={18} className="text-indigo-600" />
                  {editingRuleId ? "Edit Rule Configuration" : "New Rule Builder"}
                </h2>
              </div>
              
              <div className="p-6 md:p-8 space-y-8">
                {/* A. Identity */}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4 flex items-center gap-2 pb-2 border-b border-slate-100">
                    <FileText size={14} /> A. Trigger Conditions
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <label className="label">Rule Name *</label>
                      <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Travel > $5K" className="input" required />
                    </div>
                    <div>
                      <label className="label">Category</label>
                      <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} className="input">
                        {DEFAULT_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label">Threshold Amount >=</label>
                      <div className="relative">
                        <input type="number" value={form.threshold_amount} onChange={e => setForm(p => ({ ...p, threshold_amount: e.target.value }))} placeholder="0.00" min="0" step="0.01" className="input" />
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1">If blank, rule applies to any amount.</p>
                    </div>
                    <div className="flex items-center pt-2 md:pt-6">
                      <label className="flex items-center gap-3 cursor-pointer group">
                        <div className="relative flex items-center justify-center">
                          <input type="checkbox" checked={form.is_default} onChange={e => setForm(p => ({ ...p, is_default: e.target.checked }))} className="peer sr-only" />
                          <div className="w-5 h-5 rounded border-2 border-slate-300 peer-checked:bg-indigo-600 peer-checked:border-indigo-600 transition-colors flex items-center justify-center">
                            <CheckIcon size={12} className="text-white opacity-0 peer-checked:opacity-100" strokeWidth={3} />
                          </div>
                        </div>
                        <div>
                          <span className="text-sm font-semibold text-slate-800">Set as Default Rule</span>
                          <p className="text-[10px] text-slate-500">Fallback when no category matches</p>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>

                {/* B. Chain */}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4 flex items-center gap-2 pb-2 border-b border-slate-100">
                    <Anchor size={14} /> B. Sequential Approval Chain
                  </h3>
                  
                  {form.steps.length === 0 ? (
                    <div className="p-8 text-center bg-slate-50/80 rounded-xl border border-dashed border-slate-200 text-slate-400">
                      <p className="text-sm mb-3">No steps defined. Expenses will automatically skip manual sequence.</p>
                      <button type="button" onClick={addStep} className="btn btn-secondary btn-sm">Add First Step</button>
                    </div>
                  ) : (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                      <SortableContext items={form.steps.map(s => s.id)} strategy={verticalListSortingStrategy}>
                        <div className="space-y-3">
                          {form.steps.map((step, index) => (
                            <SortableStep
                              key={step.id} id={step.id} step={step} index={index}
                              approvers={approvers} updateStep={updateStep} removeStep={removeStep}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  )}
                  {form.steps.length > 0 && (
                    <button type="button" onClick={addStep} className="mt-4 flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border-2 border-dashed text-sm font-semibold border-slate-200 text-slate-500 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors">
                      <Plus size={16} /> Add Approver Step
                    </button>
                  )}
                </div>

                {/* C. Special */}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4 flex items-center gap-2 pb-2 border-b border-slate-100">
                    <Star size={14} /> C. Special Intervention (Optional)
                  </h3>
                  <div className="flex gap-3 items-start">
                    <div className="flex-1">
                      <select value={form.specific_approver_id} onChange={e => setForm(p => ({ ...p, specific_approver_id: e.target.value }))} className="input h-11">
                        <option value="">None configured</option>
                        {approvers.map(a => <option key={a.id} value={a.id}>{a.full_name} — {a.job_title}</option>)}
                      </select>
                      <p className="text-[10px] text-slate-500 mt-1">Special approver can bypass sequential chain at any time.</p>
                    </div>
                    {form.specific_approver_id && (
                      <button type="button" onClick={() => setForm(p => ({ ...p, specific_approver_id: "" }))} className="btn btn-secondary h-11 px-3" title="Clear special approver">
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>

                {/* D. Resolution */}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4 flex items-center gap-2 pb-2 border-b border-slate-100">
                    <Activity size={14} /> D. Resolution Logic
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                    <div>
                      <label className="label text-xs">Required Consensus %</label>
                      <div className="relative">
                        <input type="number" value={form.min_approval_percentage} onChange={e => setForm(p => ({ ...p, min_approval_percentage: e.target.value }))} placeholder="100" min="1" max="100" className="input" />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">%</span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1">Leave blank to require 100% of sequential steps.</p>
                    </div>
                    <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-100 mt-1">
                      <p className="flex items-center gap-1.5 text-indigo-800 text-xs font-bold uppercase tracking-wider mb-2">
                        <Info size={14} className="text-indigo-600" /> Summary
                      </p>
                      <p className="text-[13px] leading-relaxed text-indigo-900/80 font-medium">
                        {getResolutionSummary()}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="px-6 md:px-8 py-5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3">
                {editingRuleId && <button type="button" onClick={resetForm} className="btn btn-secondary">Cancel Edit</button>}
                <button type="submit" disabled={isSubmitting} className="btn btn-primary shadow-lg shadow-indigo-500/20 px-8">
                  {isSubmitting ? "Saving..." : editingRuleId ? "Update Workflow" : "Create Workflow"}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      </div>
    </DashboardLayout>
  );
}

// Temporary internal lucide icon definitions missing from base export depending on module map
function CheckIcon(props) {
  return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><polyline points="20 6 9 17 4 12"></polyline></svg>
}
function Edit3(props) {
  return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
}
function Users(props) {
  return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
}
