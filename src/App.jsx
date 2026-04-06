import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Login from './pages/Login'
import Welcome from './pages/Welcome'
import Editor from './pages/Editor'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/welcome" element={<Welcome />} />
        <Route path="/editor" element={<Editor />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App