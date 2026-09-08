"use client";

import { useId, useState } from "react";
import clsx from "clsx";

import { Icon } from "../ui";
import { inputClass } from "./AuthShell";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">;

/**
 * Göster/gizle düğmeli şifre alanı.
 *
 * Kullanıcı ne yazdığını görebilsin diye — özellikle kayıt sırasında, şifre
 * kuralları (en az 10 karakter, en az bir rakam) tutturulmaya çalışılırken
 * körlemesine yazmak hem yorucu hem de hataya açık.
 *
 * Notlar:
 *  - Düğme type="button": aksi hâlde forma submit ederdi.
 *  - Düğme klavyeyle erişilebilir bırakıldı (tabIndex kaldırılmadı) ve
 *    aria-label/aria-pressed taşıyor; ekran okuyucu durumu söyleyebiliyor.
 *  - Varsayılan GİZLİ. Alan her açılışta kapalı başlar; "göster" durumu
 *    bileşenin dışına sızmaz.
 *  - Sağda düğmeye yer açmak için input'a ek sağ boşluk (pr-11) veriliyor.
 */
export function PasswordInput({ className, ...rest }: Props) {
  const [gorunur, setGorunur] = useState(false);
  const id = useId();
  return (
    <div className="relative">
      <input
        {...rest}
        id={rest.id ?? id}
        type={gorunur ? "text" : "password"}
        // clsx ile BİRLEŞTİRİLİYOR: eskiden className verildiğinde temel
        // input stilini tamamen eziyordu.
        className={clsx(inputClass, className, "pr-11")}
      />
      <button
        type="button"
        onClick={() => setGorunur((v) => !v)}
        aria-label={gorunur ? "Şifreyi gizle" : "Şifreyi göster"}
        aria-pressed={gorunur}
        aria-controls={rest.id ?? id}
        className="absolute right-1 top-1/2 -translate-y-1/2 p-2 rounded-lg text-ink-400
                   hover:text-ink-700 hover:bg-ink-900/[0.04] focus:outline-none
                   focus:ring-2 focus:ring-brand-100 transition-colors"
      >
        <Icon name={gorunur ? "eyeOff" : "eye"} size={16} />
      </button>
    </div>
  );
}
