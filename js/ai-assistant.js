/* ==========================================
   VEAP – AI Emergency Assistant
   Rule-based first-aid guidance system
   ========================================== */

const AIAssistant = {
  // ---- Emergency Types & Instructions ----
  emergencyTypes: {
    accident: {
      label: 'Accident',
      icon: '🚗',
      steps: [
        'Ensure the scene is safe before approaching the victim.',
        'Call emergency services (ambulance) immediately — dial your local emergency number.',
        'Do NOT move the person unless they are in immediate danger (fire, traffic).',
        'Check for consciousness — gently tap and ask "Are you okay?"',
        'If bleeding, apply firm pressure with a clean cloth.',
        'Keep the person warm and calm. Talk to them reassuringly.',
        'Note the time of the incident for medical responders.'
      ],
      warnings: ['Do NOT remove any objects embedded in wounds.', 'Do NOT give food or water if surgery may be needed.'],
      callAction: 'Call Ambulance'
    },
    unconscious: {
      label: 'Unconscious',
      icon: '😵',
      steps: [
        'Check for responsiveness — tap shoulders and shout "Can you hear me?"',
        'Call emergency services immediately.',
        'Check if the person is breathing — look, listen, and feel for 10 seconds.',
        'If breathing: Place in recovery position (on their side).',
        'If NOT breathing: Begin CPR — 30 chest compressions, 2 rescue breaths.',
        'Keep the airway clear — tilt head back, lift chin.',
        'Continue CPR until help arrives or the person responds.'
      ],
      warnings: ['If you suspect spinal injury, do NOT move the neck.', 'Do NOT put anything in their mouth.'],
      callAction: 'Call Ambulance'
    },
    heart_attack: {
      label: 'Heart Attack',
      icon: '❤️‍🩹',
      steps: [
        'Call emergency services IMMEDIATELY — every minute counts.',
        'Have the person sit down and rest in a comfortable position (semi-reclined).',
        'If available and not allergic, give one aspirin (325mg) to chew slowly.',
        'Loosen any tight clothing around chest and neck.',
        'If the person becomes unconscious, begin CPR immediately.',
        'If an AED (defibrillator) is available, use it and follow voice prompts.',
        'Stay calm and reassure the person. Monitor their breathing.'
      ],
      warnings: ['Do NOT leave the person alone.', 'Do NOT let them walk or exert themselves.'],
      callAction: 'Call Ambulance Now'
    },
    allergic_reaction: {
      label: 'Allergic Reaction',
      icon: '🤧',
      steps: [
        'Identify and remove the allergen if possible.',
        'Check if the person has an EpiPen (epinephrine auto-injector).',
        'If they have an EpiPen: Use it on the outer thigh — through clothing is OK.',
        'Call emergency services — anaphylaxis can be life-threatening.',
        'Help the person sit upright to ease breathing (unless dizzy, then lay flat with legs raised).',
        'If symptoms include swelling of face/throat, act FAST — this is anaphylaxis.',
        'Monitor breathing and be ready to perform CPR if needed.'
      ],
      warnings: ['Anaphylaxis can worsen rapidly — do NOT wait to see if it improves.', 'A second reaction can occur hours later.'],
      callAction: 'Call Ambulance'
    },
    seizure: {
      label: 'Seizure',
      icon: '⚡',
      steps: [
        'Stay calm. Time the seizure — note when it starts.',
        'Clear the area of hard or sharp objects.',
        'Do NOT hold the person down or restrain them.',
        'Place something soft under their head if possible.',
        'Turn them on their side (recovery position) to prevent choking.',
        'Do NOT put anything in their mouth.',
        'If the seizure lasts more than 5 minutes, call emergency services.'
      ],
      warnings: ['Do NOT restrain the person or put anything in their mouth.', 'Call ambulance if: seizure >5 min, person is pregnant, injured, or it\'s their first seizure.'],
      callAction: 'Call If >5 Minutes'
    },
    choking: {
      label: 'Choking',
      icon: '😰',
      steps: [
        'Ask "Are you choking?" — if they can cough forcefully, encourage coughing.',
        'If they CANNOT speak, cough, or breathe → act immediately.',
        'Stand behind the person and wrap your arms around their waist.',
        'Make a fist with one hand, place it above the navel.',
        'Grasp fist with other hand and perform quick upward thrusts (Heimlich maneuver).',
        'Repeat until the object is expelled or the person can breathe.',
        'If the person becomes unconscious, lower to ground and begin CPR.'
      ],
      warnings: ['For infants: Use 5 back blows + 5 chest thrusts instead.', 'Call emergency services if the object cannot be dislodged.'],
      callAction: 'Call If Not Resolved'
    },
    bleeding: {
      label: 'Severe Bleeding',
      icon: '🩸',
      steps: [
        'Apply direct pressure to the wound using a clean cloth or bandage.',
        'Call emergency services if bleeding is severe or won\'t stop.',
        'Keep pressure firm and constant — do NOT remove the cloth, add more on top.',
        'If possible, elevate the injured limb above the heart.',
        'If bleeding soaks through, apply a tourniquet 2-3 inches above the wound (only for life-threatening limb bleeding).',
        'Note the time the tourniquet was applied.',
        'Keep the person warm and calm while waiting for help.'
      ],
      warnings: ['Do NOT remove embedded objects — stabilize them in place.', 'If a tourniquet is applied, do NOT loosen it.'],
      callAction: 'Call Ambulance'
    },
    burns: {
      label: 'Burns',
      icon: '🔥',
      steps: [
        'Remove the person from the heat source. Ensure your own safety first.',
        'Cool the burn with cool (not cold) running water for at least 20 minutes.',
        'Remove clothing and jewelry near the burn UNLESS stuck to the skin.',
        'Do NOT apply ice, butter, oil, or toothpaste to the burn.',
        'Cover with a clean, non-fluffy material (cling wrap works well).',
        'For severe burns (larger than palm, on face/joints, or deep): Call emergency services.',
        'Give over-the-counter pain relief if available and appropriate.'
      ],
      warnings: ['Do NOT burst blisters — this increases infection risk.', 'Chemical burns: Brush off dry chemicals first, then rinse with water.'],
      callAction: 'Call for Severe Burns'
    }
  },

  /**
   * Get context-aware steps based on user conditions
   * @param {string} emergencyType
   * @param {object} userData - user's medical data
   * @returns {object} Modified emergency response
   */
  getResponse(emergencyType, userData = {}) {
    const base = this.emergencyTypes[emergencyType];
    if (!base) return null;

    const response = {
      ...base,
      steps: [...base.steps],
      warnings: [...base.warnings],
      contextAlerts: []
    };

    // Context-aware additions based on user conditions
    const conditions = (userData.conditions || []).map(c => c.toLowerCase());
    const allergies = (userData.allergies || '').toLowerCase();

    // Diabetic context
    if (conditions.some(c => c.includes('diabet'))) {
      if (emergencyType === 'unconscious') {
        response.contextAlerts.push({
          icon: '⚠️',
          text: 'Patient is DIABETIC — Check blood sugar level. If low, apply glucose gel to gums (do NOT give food/drink to unconscious person).'
        });
      } else {
        response.contextAlerts.push({
          icon: '⚠️',
          text: 'Patient is DIABETIC — Monitor for signs of hypoglycemia (shakiness, confusion, sweating).'
        });
      }
    }

    // Asthma context
    if (conditions.some(c => c.includes('asthma'))) {
      response.contextAlerts.push({
        icon: '💨',
        text: 'Patient has ASTHMA — Check if they have an inhaler. Help them use it (shake, 4 puffs with spacer if available).'
      });
    }

    // Blood thinner / heart condition
    if (conditions.some(c => c.includes('blood thin') || c.includes('warfarin') || c.includes('heart'))) {
      if (emergencyType === 'bleeding') {
        response.contextAlerts.push({
          icon: '🩸',
          text: 'Patient may be on BLOOD THINNERS — Bleeding may be harder to control. Apply extra pressure and seek help urgently.'
        });
      }
      if (emergencyType === 'heart_attack') {
        response.contextAlerts.push({
          icon: '💊',
          text: 'Patient has a HEART CONDITION — They may have prescribed nitroglycerin. Help them take it if available.'
        });
      }
    }

    // Allergy context
    if (allergies && emergencyType === 'allergic_reaction') {
      response.contextAlerts.push({
        icon: '🚨',
        text: `Known allergies: ${userData.allergies}. Ensure the allergen is identified and removed.`
      });
    }

    // Epilepsy context
    if (conditions.some(c => c.includes('epilep'))) {
      if (emergencyType === 'seizure') {
        response.contextAlerts.push({
          icon: '⚡',
          text: 'Patient has EPILEPSY — This may be a known condition. Check for a medical bracelet or medication info.'
        });
      }
    }

    return response;
  },

  /**
   * Render AI response into a container
   * @param {object} response - from getResponse()
   * @param {HTMLElement} container
   */
  renderResponse(response, container) {
    if (!response || !container) return;

    let html = `
      <div class="ai-panel animate-in">
        <div class="ai-panel__header">
          <span>🤖</span>
          <span>AI Emergency Assistant</span>
        </div>
        <div style="font-size:var(--font-sm);color:var(--text-muted);margin-bottom:var(--space-md)">
          Emergency type: <strong style="color:var(--text-primary)">${response.icon} ${response.label}</strong>
        </div>
    `;

    // Context alerts (based on patient conditions)
    if (response.contextAlerts && response.contextAlerts.length > 0) {
      response.contextAlerts.forEach(alert => {
        html += `
          <div class="ai-warning" style="background:rgba(245,158,11,0.12);color:#fcd34d;margin-bottom:var(--space-sm)">
            <span>${alert.icon}</span>
            <span>${alert.text}</span>
          </div>
        `;
      });
    }

    // Steps
    html += `<ol class="ai-steps">`;
    response.steps.forEach(step => {
      html += `<li>${step}</li>`;
    });
    html += `</ol>`;

    // Warnings
    if (response.warnings.length > 0) {
      response.warnings.forEach(warn => {
        html += `
          <div class="ai-warning">
            <span>⚠️</span>
            <span>${warn}</span>
          </div>
        `;
      });
    }

    html += `</div>`;

    container.innerHTML = html;
  }
};
