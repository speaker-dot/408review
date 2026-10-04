import { beforeEach,afterEach,describe,it,expect,vi } from 'vitest'
import { mount,flushPromises } from '@vue/test-utils'
import { createPinia,setActivePinia } from 'pinia'
import QuizBox from '@/components/QuizBox.vue'
import MarkdownContent from '@/components/MarkdownContent.vue'
import LearningPanel from '@/components/LearningPanel.vue'
import RecallCheck from '@/components/RecallCheck.vue'
import StudyView from '@/views/StudyView.vue'
import { useLearningStore } from '@/stores/learning'
import { db } from '@/db/db'
import type { Quiz } from '@/types'
const quiz:Quiz={id:'DS-04-01-002-Q001',type:'choice',question:'失配时 $i$ 怎样处理？',options:['A. $i=i-1$','B. $i$ 不变','C. $j=j+1$','D. 重置 $i$'],answer:'B',explanation:'保持主串指针不回退，复用模式已匹配的前后缀。',source:{label:'本站原创',adapted:false}}
function wrapper(q=quiz){return mount(QuizBox,{props:{quiz:q,index:1,nodeId:'DS-04-01-002'}})}
async function button(w:ReturnType<typeof wrapper>,text:string){const b=w.findAll('button').find(b=>b.text().includes(text));expect(b).toBeDefined();await b!.trigger('click');await flushPromises();await vi.waitFor(()=>expect(w.findAll('button').some(b=>b.text()==='保存中…')).toBe(false))}
beforeEach(async()=>{setActivePinia(createPinia());await db.delete();await db.open()})
afterEach(async()=>{await db.delete();vi.restoreAllMocks()})
describe('math and quiz interactions',()=>{
  it('renders LaTeX in each option, not literal dollar source',()=>{const w=wrapper();expect(w.findAll('.quiz-option .katex')).toHaveLength(4);expect(w.find('.quiz-option').text()).not.toContain('$');w.unmount()})
  it('sanitizes scripts and dangerous HTML',()=>{const w=mount(MarkdownContent,{props:{content:'<script>alert(1)</script><img src=x onerror=alert(1)> $x_1$'}});expect(w.find('script').exists()).toBe(false);expect(w.find('[onerror]').exists()).toBe(false);expect(w.find('img').exists()).toBe(false);expect(w.find('.katex').exists()).toBe(true);w.unmount()})
  it('does not submit with no selected option',async()=>{const w=wrapper();expect(w.find('.primary-button').attributes('disabled')).toBeDefined();expect(await db.attempts.count()).toBe(0);w.unmount()})
  it('persists wrong answers and a later successful retry without deleting history',async()=>{
    const w=wrapper();await w.findAll('.quiz-option')[0].trigger('click');await button(w,'提交答案');expect(w.text()).toContain('正确答案：B');expect((await db.attempts.toArray())[0].correct).toBe(false)
    await button(w,'重新作答');await w.findAll('.quiz-option')[1].trigger('click');await button(w,'提交答案');expect(w.text()).toContain('回答正确');expect(await db.attempts.count()).toBe(2);w.unmount()
  })
  it('saves a wrong cause and note without another attempt',async()=>{
    const w=wrapper();await w.findAll('.quiz-option')[0].trigger('click');await button(w,'提交答案');await w.find('select').setValue('condition');await w.find('textarea').setValue('下次先核对下标约定');await button(w,'保存错因')
    await vi.waitFor(()=>expect(w.text()).toContain('错因已保存'));const rows=await db.attempts.toArray();expect(rows).toHaveLength(1);expect(rows[0].errorKind).toBe('condition');expect(rows[0].note).toContain('下标');w.unmount()
  })
  it('keeps submit enabled for retry when storage fails',async()=>{
    const store=useLearningStore(),spy=vi.spyOn(store,'recordAttempt').mockRejectedValueOnce(new Error('quota'));const w=wrapper();await w.findAll('.quiz-option')[1].trigger('click');await button(w,'提交答案');expect(w.text()).toContain('未保存');expect(w.find('.answer-panel').exists()).toBe(false);spy.mockRestore();await button(w,'提交答案');expect(w.text()).toContain('回答正确');expect(await db.attempts.count()).toBe(1);w.unmount()
  })
  it('ignores late submission UI results after changing the current question',async()=>{
    const store=useLearningStore();let done!:()=>void;vi.spyOn(store,'recordAttempt').mockImplementation(()=>new Promise<void>(r=>done=r));const w=wrapper();await w.findAll('.quiz-option')[1].trigger('click');await w.find('.primary-button').trigger('click');await w.setProps({quiz:{...quiz,id:'DS-04-01-002-Q002',answer:'A'}});done();await flushPromises();expect(w.find('.answer-panel').exists()).toBe(false);expect(w.find('.quiz-option.selected').exists()).toBe(false);w.unmount()
  })
  it('guards against double submissions while saving',async()=>{
    const store=useLearningStore();let done!:()=>void;const spy=vi.spyOn(store,'recordAttempt').mockImplementation(()=>new Promise<void>(r=>done=r));const w=wrapper();await w.findAll('.quiz-option')[1].trigger('click');await w.find('.primary-button').trigger('click');await w.find('.primary-button').trigger('click');expect(spy).toHaveBeenCalledTimes(1);done();await flushPromises();w.unmount()
  })
  it('does not call an analysis answer objectively correct merely because it was revealed',async()=>{
    const q:Quiz={...quiz,type:'analysis',options:undefined,answer:'用完整步骤推导。'};const w=wrapper(q);await button(w,'查看参考答案');expect(await db.attempts.count()).toBe(0);await button(w,'还不会');const a=(await db.attempts.toArray())[0];expect(a.selfAssessed).toBe(true);expect(a.correct).toBe(false);w.unmount()
  })
})
describe('personal learning controls',()=>{
  it('keeps a corrected wrong-book card long enough to read its explanation',async()=>{
    const now=Date.now();await db.attempts.add({id:'prior-wrong',nodeId:'DS-04-01-002',quizId:quiz.id,type:'choice',quiz,selectedAnswer:'A',correct:false,selfAssessed:false,note:'',createdAt:now-1000,updatedAt:now-1000})
    const w=mount(StudyView,{global:{stubs:{RouterLink:true}}});await useLearningStore().initialize();await w.findAll('button').find(b=>b.text()==='错题本')!.trigger('click');await vi.waitFor(()=>expect(w.findAll('.quiz-option')).toHaveLength(4));await w.findAll('.quiz-option')[1].trigger('click');await w.findAll('button').find(b=>b.text()==='提交答案')!.trigger('click');await vi.waitFor(()=>expect(w.text()).toContain('回答正确'));expect(w.text()).toContain('本次已纠正');await w.findAll('button').find(b=>b.text().includes('刷新错题清单'))!.trigger('click');expect(w.find('.quiz-box').exists()).toBe(false);expect(await db.attempts.count()).toBe(2);w.unmount()
  })
  it('keeps a note and bookmark after remount',async()=>{
    const w=mount(LearningPanel,{props:{nodeId:'DS-04-01-002'},global:{stubs:{RouterLink:true}}});await w.find('textarea').setValue('KMP 不回退主串');await w.findAll('button').find(b=>b.text()==='保存笔记')!.trigger('click');await vi.waitFor(()=>expect(useLearningStore().progress[0]?.note).toContain('KMP'));await w.findAll('button').find(b=>b.text().includes('收藏知识点'))!.trigger('click');await vi.waitFor(()=>expect(w.text()).toContain('已收藏'));w.unmount();await useLearningStore().reload();const restored=mount(LearningPanel,{props:{nodeId:'DS-04-01-002'},global:{stubs:{RouterLink:true}}});expect((restored.find('textarea').element as HTMLTextAreaElement).value).toContain('KMP');expect(restored.text()).toContain('已收藏');restored.unmount()
  })
  it('records recall as self assessment and cannot double-rate one reveal',async()=>{
    const w=mount(RecallCheck,{props:{nodeId:'DS-04-01-002',index:0,question:'为什么不回退？',answer:'已比较的前缀可被复用。'}});await w.findAll('button')[2].trigger('click');await flushPromises();expect(await db.attempts.count()).toBe(1);expect((await db.attempts.toArray())[0].type).toBe('recall');expect((await db.attempts.toArray())[0].selfAssessed).toBe(true);expect(w.find('button').attributes('disabled')).toBeDefined();w.unmount()
  })
})
