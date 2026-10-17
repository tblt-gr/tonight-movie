"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Info, X } from "lucide-react";

const STEPS = [
  "Connectez-vous à letterboxd.com depuis un ordinateur.",
  "Ouvrez votre profil, puis choisissez « Settings » (Réglages).",
  "Allez dans l’onglet « Import & Export ».",
  "Cliquez sur « Export your data ».",
  "Téléchargez l’archive .zip proposée par Letterboxd.",
  "Revenez ici et déposez l’archive dans la zone d’import, sans la décompresser.",
];

export function ExportGuide() {
  return (
    <Dialog.Root>
      <Dialog.Trigger className="icon-button" aria-label="Comment obtenir mon export Letterboxd ?">
        <Info aria-hidden="true" />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog">
          <Dialog.Title className="dialog-title">Obtenir votre export Letterboxd</Dialog.Title>
          <Dialog.Description className="dialog-text">
            Letterboxd ne se connecte pas à Tonight’s Movie : vous téléchargez vous-même vos
            données, puis vous les déposez ici.
          </Dialog.Description>
          <ol className="dialog-steps">
            {STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <Dialog.Close className="button">Fermer</Dialog.Close>
          <Dialog.Close className="icon-button dialog-x" aria-label="Fermer">
            <X aria-hidden="true" />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
