          this.decisionModalId = i.id;
          this.mobileAlertsOpen = true;
        }
        this.render();
      });
      el.querySelector('#spawn-any')!.addEventListener('click', () => {
        const i = this.incidents.SpawnIncident();
        if (i) {
          this.city.syncIncidents(this.incidents.openIncidents);
          this.city.focusOn(i.x, i.z);
          if (!i.selectedDecision) this.decisionModalId = i.id;
          this.mobileAlertsOpen = true;
        }
        this.render();
      });
    }
    return el;
  }
}
