import { useNavigate } from 'react-router-dom'
import QuestionnaireFlow from '../components/QuestionnaireFlow'

export default function CheckIn() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-slate-50">
      <QuestionnaireFlow
        onClose={() => {
          navigate('/progress')
        }}
      />
    </div>
  )
}
