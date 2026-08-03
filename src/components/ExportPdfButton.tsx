import GatedIconButton from './GatedIconButton';
import { DownloadIcon } from './icons';

interface Props {
  onClick: () => void;
  disabled?: boolean;
}

// The Export PDF action shared by every calculator page — greyed out and
// linking to /account for non-premium users, icon-only alongside Share/Save.
export default function ExportPdfButton({ onClick, disabled }: Props) {
  return <GatedIconButton label="Export PDF" icon={<DownloadIcon />} onClick={onClick} disabled={disabled} />;
}
