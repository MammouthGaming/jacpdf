import { TAB_DEFS } from '../lib/classroomConstants'

export default function ClassroomTabs({ tab, setTab }) {
  return (
    <nav className="cpp-tabs" role="tablist">
      {TAB_DEFS.map((tabDefinition) => (
        <button
          key={tabDefinition.id}
          role="tab"
          aria-selected={tab === tabDefinition.id}
          className={`cpp-tab${tab === tabDefinition.id ? ' is-active' : ''}`}
          onClick={() => setTab(tabDefinition.id)}
        >
          {tabDefinition.label}
        </button>
      ))}
    </nav>
  )
}