module.exports = {
  purge: [],
  darkMode: false, // or 'media' or 'class'
  theme: {
    extend: {
      width: {
        120: '30rem',
      },
      height: {
        90: '22.5rem',
      },
      borderWidth: {
        12: '12px',
      },
      zIndex: {
        '-10': '-10',
      },
    },
  },
  variants: {
    extend: {
      borderWidth: ['hover'],
      borderRadius: ['hover'],
    },
  },
  plugins: [],
};
