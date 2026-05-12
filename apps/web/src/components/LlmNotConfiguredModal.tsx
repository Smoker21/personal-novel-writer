import { useNavigate } from 'react-router-dom';
import { Modal } from './Modal';
import { Button } from './Button';

export function LlmNotConfiguredModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="尚未設定 LLM"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>稍後再說</Button>
          <Button
            variant="primary"
            onClick={() => {
              onClose();
              navigate('/settings');
            }}
          >
            前往設定頁
          </Button>
        </>
      }
    >
      <p className="text-sm text-ink-600 dark:text-ink-200 leading-relaxed">
        您尚未設定 LLM provider，請先到設定頁啟用一個 provider 並指定預設模型，才能使用 AI 撰寫 / 統整 / 精簡功能。
      </p>
    </Modal>
  );
}
