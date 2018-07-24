var app = new Vue({
  el: '#app',
  data: {
    // To store the current error message.
    error: null,
    // To store the assignment data.
    assignments: loadAssignments(),
    // To store data relative to the form.
    selected: {
      // Exercise radio button
      exercise: '',
      // Auto generated (see getDateString()).
      startDate: '',
      // Auto generated (see getDateString()).
      endDate: '',
      // Start date and time inputs.
      start: {
        date: '',
        time: ''
      },
      // End date and time inputs.
      end: {
        date: '',
        time: ''
      }
    },
    // References to the currently selected assignment.
    activeAssignment: null
  },
  computed: {
    /**
     * Returns the current date with the yyyy-MM-dd format.
     */
    startDateMin() {
      return new Date().toISOString().substring(0, 10);;
    },
  },
  methods: {
    /**
     * Returns the selected start date with the yyyy-MM-dd format.
     * If there is no selected start date, returns the computed `startDateMin` property.
     * @returns {String} A yyyy-MM-dd string date representation.
     */
    endDateMin() {
      var selectedStart = this.assembleDate('start')
      return selectedStart ? selectedStart.toISOString().substring(0, 10) : this.startDateMin;
    },
    /**
     * Converts the splitted date and time value of the `ref` date to an ISO string représentation.
     * @param {String} ref The date for which we get the string. Either 'start' or 'end'.
     * @returns {String | null} An ISO string date representation or `null` if the `ref` date is not valid.
     */
    getDateString(ref) {
      var date = this.assembleDate(ref);
      return date ? date.toISOString() : null;
    },
    /**
     * Sets the assignment at `index` in the `assignments` array property as the currently selected assignment.
     * The previously selected assignment (if any) is returned to its original state.
     * This method also change the value of the `selected.exercise` property to the selected assignment id.
     * @param {Number} index An index within the `assignments` array property.
     */
    setActive(index) {
      if (this.activeAssignment) this.activeAssignment.active = false;
      this.activeAssignment = this.assignments[index];
      this.activeAssignment.active = true;
      this.selected.exercise = this.activeAssignment.id;
    },
    /**
     * Submits the whole form.
     * This can only be actually the case if an assignment is selected, and the optional dates are valid and consistant.
     */
    submit() {
      // Prevent a click on the disabled button to still fire the process.
      if (this.selected.exercise === '') return;
      this.error = null;
      var startDate, endDate;
      // Check that date & time are here
      if (this.selected.start.date && !this.selected.start.time) {
        this.error = "Heure d'ouverture obligatoire en plus de la date.";
      } else if (this.selected.end.date && !this.selected.end.time) {
        this.error = "Heure de fermeteure obligatoire en plus de la date.";
      }

      if (!this.error) {
        // Get date objects
        startDate = this.assembleDate('start');
        endDate = this.assembleDate('end');

        // Check start at least equal to today
        var today = new Date();
        // Both dates are optionnal, thus the check or executed only when the corresponding dates exist.
        if (startDate && startDate < today) {
          this.error = "Date d'ouverture dépassée.";
        } else if (startDate && endDate && endDate < startDate) {
          this.error = "Date de fermeture avant date d'ouverture."
        }
      }

      if (!this.error) {
        document.getElementById('selection').submit();
      }
    },
    /**
     * Converts the splitted date and time value of the `ref` date to a Date object.
     * The Date object is created with an UTC date string, constructed with both date and time inputs value.
     * @param {String} ref The date from which the object will be created. Either 'start' or 'end'.
     * @returns {Object | null} A Date object representing the `ref` date, or `null` if not valid.
     */
    assembleDate(ref) {
      var dateString = this.selected[ref].date + (this.selected[ref].time ? 'T' + this.selected[ref].time : '');
      return dateString !== '' ? new Date(dateString) : null;
    }
  }
});

/**
 * Loads assignment data from a tag with ID `data`.
 * This should be attributed to a script tag containing a JSON string.
 * The tag with id `data` is then remove from the DOM.
 * @returns {Array} An array of objects
 */
function loadAssignments() {
  var dataEle = document.getElementById('data');
  var assignments = JSON.parse(dataEle.innerText);
  dataEle.remove();
  assignments.map(assignment => {
    assignment.active = false;
    return assignment;
  });
  return assignments;
}